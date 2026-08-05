/**
 * 公告详情与翻译路由
 * Notice detail & translation routes
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { normalizeContactRows, extractContactsFromText } from "../../utils/normalize";
import { preferValue } from "../../utils/json";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "../../services/notices";
import { normalizeUnspscCodes } from "../../services/unspsc";
import { NOTICE_TRANSLATION_LANGS, getTranslatedNoticeDetail } from "../../services/notice-translation";
import { detectSourceLang, translateNoticeViaChain } from "../../services/notice-translation";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";

export function createNoticeDetailRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.noticesRepo;
  const usersRepo = ctx.usersRepo;
  const membershipRepo = ctx.membershipRepo;

  // ── 公告详情 ──
  router.get("/api/notices/:id/detail", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

    // 解锁校验与公告查询相互独立：并行执行减少一次顺序往返
    const [unlock, notice] = await Promise.all([
      noticesRepo.findUnlock(userKey, noticeId),
      noticesRepo.findDetail(noticeId),
    ]);
    if (!unlock) return res.status(403).json({ error: "NOTICE_LOCKED", core_locked: true });

    if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    res.json(normalizeNoticeDetailPayload(notice, unlock, opportunity));
  }));

  // ── 公告全文内容（公开·不受锁定状态限制）──
  // 搜索 SQL 为性能将 description 截断为 300 字符（LEFT(n.description, 300)），
  // 详情页初始使用搜索结果数据导致原文被截断；本端点返回完整 description + title，
  // 确保详情页原文与译文（翻译 API 使用全文）长度一致，"查看原文"开关有意义。
  // 同时返回 description_cn（来自机会表），确保中文环境下详情页可立即显示中文描述，
  // 避免卡片与详情页语言显示不一致（卡片通过 description_cn/bid_overview 显示中文）。
  router.get("/api/notices/:id/content", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    if (!noticeId) return res.status(400).json({ error: "INVALID_NOTICE_ID" });

    const notice = await noticesRepo.findDetail(noticeId);
    if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

    // 获取机会表 description_cn（中文环境立即显示，无需等待翻译 API）
    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const descriptionCn = opportunity ? String(opportunity.description_cn || "").trim() : "";

    res.json({
      description: notice.description || "",
      title: notice.title || "",
      description_cn: descriptionCn,
    });
  }));

  // ── 公告锁定态预览（渐进式信息展示·敏感度分级）──
  // 列表/推荐端点出于商业保护将 agency/unspsc 置空；本端点按敏感度分级下发：
  // 次要信息（发布日期/投标难度/注册门槛/行业分类/机构简称/机构全称）真实下发给所有登录用户；
  // 核心敏感信息（联系人身份/文件清单/报告/来源链接）绝不返回，仅下发联系人数量
  // 作为数量预告（仍走解锁口径：/:id/detail 403 不变）。
  router.get("/api/notices/:id/preview", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

    const notice = await noticesRepo.findPreview(noticeId);
    if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

    const opportunity = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
    const unspscCodes = normalizeUnspscCodes(preferValue(opportunity?.unspsc_codes, notice.unspsc_codes)).slice(0, 4);

    // 联系人数量预告：与解锁后 normalizeNoticeDetailPayload 同款归一化口径
    //（结构化联系人为空时回退正文提取），只下发数量、绝不下发身份内容
    const structuredContacts = normalizeContactRows(opportunity?.contacts, notice.contacts, notice.key_contacts);
    const contactCount = structuredContacts.length > 0
      ? structuredContacts.length
      : extractContactsFromText(String(notice.description || "")).length;

    res.json({
      agency: notice.agency || notice.organization || opportunity?.agency || "",
      agency_full: opportunity?.agency_full || notice.agency_full || "",
      published_date: preferValue(opportunity?.published_date, notice.published_date) || "",
      difficulty: preferValue(opportunity?.difficulty, notice.difficulty) || "",
      registration_level: preferValue(opportunity?.registration_level, notice.registration_level) || "",
      unspsc_codes: unspscCodes,
      contact_count: contactCount,
    });
  }));

  // ── 公告翻译 ──
  router.get("/api/notices/:id/translation", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const lang = String(req.query.lang || "").toLowerCase();
    if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
      return res.status(400).json({ error: "INVALID_NOTICE_OR_LANG" });
    }

    // ── 中文快速路径：机会表 description_cn 直出（零翻译 API 调用）──
    // 精选公告的中文描述已人工/AI 精加工存储在 crm_bid_opportunities.description_cn，
    // 无需再走翻译链 API；仅需确认标题翻译已缓存即可完整返回。
    if (lang === "zh") {
      const notice = await noticesRepo.findDetail(noticeId);
      if (notice) {
        const opp = await findQualifiedOpportunityForNotice(ctx.dbPool, notice);
        const descCn = opp ? String(opp.description_cn || "").trim() : "";
        if (descCn) {
          const cached = await noticesRepo.findTranslationCache(noticeId, "zh");
          if (cached?.title_tr) {
            // 最快路径：标题缓存 + description_cn 直出（< 100ms，零 API 成本）
            return res.json({
              lang: "zh", title: cached.title_tr, description: descCn,
              cached: true, source: "description_cn",
            });
          }
          // 标题未缓存：立即返回原文标题 + description_cn，标题翻译异步执行
          const title = String(notice.title || "").trim();
          if (title) {
            const srcLang = detectSourceLang(title, "") ?? undefined;
            // 原文已是中文：直接缓存标题，零 API 成本
            if (srcLang === "zh") {
              await noticesRepo.upsertTranslation(noticeId, "zh", title, null, "same-lang-passthrough");
            } else {
              // 原文非中文：立即返回原文标题，标题翻译异步执行（下次访问命中缓存）
              void (async () => {
                try {
                  const result = await translateNoticeViaChain(title, "", "zh", srcLang);
                  if (result.provider !== "same-lang-passthrough" && result.translations[0]) {
                    await noticesRepo.upsertTranslation(noticeId, "zh", result.translations[0], null, result.provider);
                  }
                } catch { /* 异步标题翻译失败不影响当前响应 */ }
              })();
            }
            return res.json({
              lang: "zh", title, description: descCn,
              cached: false, source: "description_cn",
            });
          }
        }
      }
    }

    // ── 通用路径 ──
    try {
      const result = await getTranslatedNoticeDetail(noticeId, lang, noticesRepo, ctx.dbPool);
      res.json(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "TRANSLATION_UNAVAILABLE") {
        throw new HttpError(503, "TRANSLATION_UNAVAILABLE");
      }
      if (err instanceof Error && err.message === "NOTICE_NOT_FOUND") {
        return res.status(404).json({ error: "NOTICE_NOT_FOUND" });
      }
      throw err;
    }
  }));

  return router;
}
