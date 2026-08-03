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

  // ── 公告锁定态预览（渐进式信息展示·敏感度分级）──
  // 列表/推荐端点出于商业保护将 agency/unspsc 置空；本端点按敏感度分级下发：
  // 次要信息（发布日期/投标难度/注册门槛/行业分类/机构简称）真实下发给所有登录用户；
  // 核心敏感信息（联系人身份/文件清单/报告/来源链接）绝不返回，仅下发联系人数量
  // 作为数量预告（仍走解锁口径：/:id/detail 403 不变）。VIP 额外获得机构全称。
  router.get("/api/notices/:id/preview", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

    const notice = await noticesRepo.findPreview(noticeId);
    if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

    // VIP 判定与供应商联系人端点同款口径：active 订阅未过期 或 membership_tier = 'vip'
    const [user, subs] = await Promise.all([
      usersRepo.findByKey(userKey),
      membershipRepo.findActiveSubscriptions(userKey),
    ]);
    const isVip = subs.length > 0 || user?.membership_tier === "vip";

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
      published_date: preferValue(opportunity?.published_date, notice.published_date) || "",
      difficulty: preferValue(opportunity?.difficulty, notice.difficulty) || "",
      registration_level: preferValue(opportunity?.registration_level, notice.registration_level) || "",
      unspsc_codes: unspscCodes,
      contact_count: contactCount,
      ...(isVip
        ? { agency_full: opportunity?.agency_full || notice.agency_full || "" }
        : {}),
    });
  }));

  // ── 公告翻译 ──
  router.get("/api/notices/:id/translation", asyncHandler(async (req, res) => {
    const noticeId = Number(req.params.id);
    const lang = String(req.query.lang || "").toLowerCase();
    if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
      return res.status(400).json({ error: "INVALID_NOTICE_OR_LANG" });
    }
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
