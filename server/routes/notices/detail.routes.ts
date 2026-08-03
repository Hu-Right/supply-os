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
import {
  NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations,
  translateNoticeViaChain, detectSourceLang,
} from "../../services/notice-translation";
import { NoticesRepo } from "../../repos/notices.repo";
import { UsersRepo } from "../../repos/users.repo";
import { MembershipRepo } from "../../repos/membership.repo";

export function createNoticeDetailRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx; // 仅供 findQualifiedOpportunityForNotice 服务层函数使用
  const noticesRepo = ctx.noticesRepo ?? new NoticesRepo(ctx.dbPool);
  const usersRepo = ctx.usersRepo ?? new UsersRepo(ctx.dbPool);
  const membershipRepo = ctx.membershipRepo ?? new MembershipRepo(ctx.dbPool);

  // ── 公告详情 ──
  router.get("/api/notices/:id/detail", async (req, res) => {
    try {
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
      const opportunity = await findQualifiedOpportunityForNotice(dbPool, notice);
      res.json(normalizeNoticeDetailPayload(notice, unlock, opportunity));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── 公告锁定态预览（渐进式信息展示·敏感度分级）──
  // 列表/推荐端点出于商业保护将 agency/unspsc 置空；本端点按敏感度分级下发：
  // 次要信息（发布日期/投标难度/注册门槛/行业分类/机构简称）真实下发给所有登录用户；
  // 核心敏感信息（联系人身份/文件清单/报告/来源链接）绝不返回，仅下发联系人数量
  // 作为数量预告（仍走解锁口径：/:id/detail 403 不变）。VIP 额外获得机构全称。
  router.get("/api/notices/:id/preview", async (req, res) => {
    try {
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

      const opportunity = await findQualifiedOpportunityForNotice(dbPool, notice);
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── 公告翻译 ──
  router.get("/api/notices/:id/translation", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const lang = String(req.query.lang || "").toLowerCase();
      if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
        return res.status(400).json({ error: "INVALID_NOTICE_OR_LANG" });
      }

      const cachedRow = await noticesRepo.findTranslationCache(noticeId, lang);
      if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
        // 统一规则：有机会表数据就用机会表的，不管公告表的
        // 检测机会表是否覆盖了公告表描述（决定翻译源和中文直出）
        const nForCache = await noticesRepo.findDescMeta(noticeId);
        let oppForCache: any = null;
        let hasOppOverride = false;
        let cacheDescSource = nForCache?.notice_desc || "";
        if (nForCache) {
          oppForCache = await findQualifiedOpportunityForNotice(dbPool, nForCache);
          if (oppForCache) {
            const oppDesc = String(oppForCache.description || "");
            if (oppDesc && oppDesc !== cacheDescSource) {
              cacheDescSource = oppDesc;
              hasOppOverride = true;
            }
          }
        }
        // 中文环境：机会表有 description_cn 时直出（机会表数据优先，零 API 成本）
        if (lang === "zh" && oppForCache && String(oppForCache.description_cn || "").trim()) {
          return res.json({
            lang, title: cachedRow.title_tr, description: oppForCache.description_cn,
            cached: true, source: "description_cn",
          });
        }
        // 机会表描述覆盖了公告表描述时，翻译源已变化，需从机会表描述重新翻译
        if (hasOppOverride && cacheDescSource.trim()) {
          const pendingKeyStale = `${noticeId}:${lang}`;
          let pendingStale = pendingNoticeTranslations.get(pendingKeyStale);
          if (!pendingStale) {
            const staleSourceLang = detectSourceLang("", cacheDescSource) ?? undefined;
            pendingStale = translateNoticeViaChain("", cacheDescSource, lang, staleSourceLang);
            pendingNoticeTranslations.set(pendingKeyStale, pendingStale);
            pendingStale.finally(() => pendingNoticeTranslations.delete(pendingKeyStale)).catch(() => undefined);
          }
          const { translations: staleTr, provider: staleProvider } = await pendingStale;
          if (staleProvider !== "same-lang-passthrough") {
            await noticesRepo.updateTranslationDescription(noticeId, lang, staleTr[1], staleProvider);
          }
          return res.json({ lang, title: cachedRow.title_tr, description: staleTr[1], cached: false, source: "opp_retranslate" });
        }
        return res.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
      }
      if (cachedRow && cachedRow.title_tr && !cachedRow.description_tr) {
        // 标题已有缓存，描述缺失——单独补翻描述，标题立即返回不阻塞
        const n = await noticesRepo.findDescMeta(noticeId);
        let descSource = n?.notice_desc || "";
        let oppForDesc: any = null;
        if (n) {
          oppForDesc = await findQualifiedOpportunityForNotice(dbPool, n);
          if (oppForDesc) descSource = String(preferValue(oppForDesc.description, descSource));
        }
        // 中文环境：机会表有 description_cn 时直出（零 API 成本，无需走翻译链）
        if (lang === "zh" && oppForDesc && String(oppForDesc.description_cn || "").trim()) {
          // 异步补翻 description_tr 缓存（不阻塞当前响应）
          void (async () => {
            try {
              const descSourceLang = detectSourceLang("", String(descSource)) ?? undefined;
              const descOnlyResult = await translateNoticeViaChain("", String(descSource), lang, descSourceLang);
              if (descOnlyResult.provider !== "same-lang-passthrough" && descOnlyResult.translations[1]) {
                await noticesRepo.updateTranslationDescription(noticeId, lang, descOnlyResult.translations[1], descOnlyResult.provider);
              }
            } catch { /* 异步补翻失败不影响用户 */ }
          })();
          return res.json({ lang, title: cachedRow.title_tr, description: oppForDesc.description_cn, cached: true, source: "description_cn" });
        }
        if (!String(descSource || "").trim()) {
          return res.json({ lang, title: cachedRow.title_tr, description: null, cached: true });
        }
        const pendingKeyDesc = `${noticeId}:${lang}:desc`;
        let pendingDesc = pendingNoticeTranslations.get(pendingKeyDesc);
        if (!pendingDesc) {
          const descSourceLang = detectSourceLang("", String(descSource)) ?? undefined;
          pendingDesc = translateNoticeViaChain("", String(descSource), lang, descSourceLang);
          pendingNoticeTranslations.set(pendingKeyDesc, pendingDesc);
          pendingDesc.finally(() => pendingNoticeTranslations.delete(pendingKeyDesc)).catch(() => undefined);
        }
        const { translations: descTranslations, provider: descProvider } = await pendingDesc;
        const descTr = descTranslations[1];
        if (descProvider === "same-lang-passthrough") {
          return res.json({ lang, title: cachedRow.title_tr, description: descTr, cached: false, passthrough: true });
        }
        await noticesRepo.updateTranslationDescription(noticeId, lang, descTr, descProvider);
        return res.json({ lang, title: cachedRow.title_tr, description: descTr, cached: false });
      }

      const notice = await noticesRepo.findForTranslation(noticeId);
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

      // 与详情页共用取文逻辑：优先机会表 description，回退公告表 description
      // 保证"翻的 = 看的"；普通公告查不到合格机会，行为与旧逻辑完全一致
      const opp = await findQualifiedOpportunityForNotice(dbPool, notice);
      const mergedDescription = opp ? String(preferValue(opp.description, notice.description || "")) : String(notice.description || "");

      // 中文环境 + 机会表有 description_cn：描述直出，仅翻译标题（大幅减少等待）
      const zhDescCn = lang === "zh" && opp && String(opp.description_cn || "").trim() ? opp.description_cn : null;

      // 统一检测源语言一次，后续主翻译 + 英文中枢兜底复用，避免重复检测导致小语种误判为英文
      const detectedSourceLang = detectSourceLang(String(notice.title || ""), mergedDescription) ?? undefined;

      const pendingKey = `${noticeId}:${lang}`;
      let pending = pendingNoticeTranslations.get(pendingKey);
      if (!pending) {
        // 有 description_cn 时只需翻译标题（description 传空，省 token + 提速）
        const descForChain = zhDescCn ? "" : mergedDescription;
        pending = translateNoticeViaChain(String(notice.title || ""), descForChain, lang, detectedSourceLang);
        pendingNoticeTranslations.set(pendingKey, pending);
        pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
      }
      const started = Date.now();
      const { translations, provider, degradedFrom } = await pending;
      // 结构化日志：含降级轨迹，便于监控通道健康度
      console.log(
        `[translate] target=notice:${noticeId} lang=${lang} provider=${provider} ms=${Date.now() - started} degraded=${degradedFrom?.join(",") || "-"}`
      );

      if (provider === "same-lang-passthrough") {
        return res.json({ lang, title: translations[0], description: zhDescCn || translations[1], cached: false, passthrough: true });
      }

      // 有 description_cn 时仅缓存标题翻译，描述走 description_cn 直出
      const descToCache = zhDescCn ? null : translations[1];
      await noticesRepo.upsertTranslation(noticeId, lang, translations[0], descToCache, provider);
      res.json({ lang, title: translations[0], description: zhDescCn || translations[1], cached: false, source: zhDescCn ? "description_cn" : "chain" });

      // ── 英文中枢兜底 ──
      // 小语种公告必须同时拥有中英文两套译文；非 en/zh 原文在请求任一语言时自动补齐另一语言
      if (lang !== "en" && detectedSourceLang && detectedSourceLang !== "en" && detectedSourceLang !== "zh") {
          void (async () => {
            try {
              if (await noticesRepo.hasTranslation(noticeId, "en")) return;
              const enPendingKey = `${noticeId}:en`;
              if (pendingNoticeTranslations.has(enPendingKey)) return;
              const enPromise = translateNoticeViaChain(String(notice.title || ""), mergedDescription, "en", detectedSourceLang);
              pendingNoticeTranslations.set(enPendingKey, enPromise);
              enPromise.finally(() => pendingNoticeTranslations.delete(enPendingKey)).catch(() => undefined);
              const enResult = await enPromise;
              if (enResult.provider !== "same-lang-passthrough") {
                await noticesRepo.upsertEnPivotTranslation(noticeId, enResult.translations[0] || null, enResult.translations[1] || null, enResult.provider);
              }
            } catch (err: any) {
              console.warn(`[translate] en-pivot failed target=notice:${noticeId}: ${err?.message}`);
            }
          })();
      }
    } catch (err: any) {
      if (err?.message === "TRANSLATION_UNAVAILABLE") {
        return res.status(503).json({ error: "TRANSLATION_UNAVAILABLE" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
