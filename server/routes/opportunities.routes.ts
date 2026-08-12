/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { normalizeUnspscCodes, persistUserInterestCodes } from "../services/unspsc";
import { OpportunitiesRepo } from "../repos/opportunities.repo";
import { MembershipRepo } from "../repos/membership.repo";
import {
  NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations, translateNoticeViaChain,
} from "../services/notice-translation";

export function createOpportunitiesRouter(ctx: AppContext): Router {
  const router = Router();
  const opportunitiesRepo = ctx.opportunitiesRepo ?? new OpportunitiesRepo(ctx.dbPool);
  const membershipRepo = ctx.membershipRepo ?? new MembershipRepo(ctx.dbPool);

  router.get("/api/opportunities", asyncHandler(async (req, res) => {
    const codeId = Number(req.query.code_id || req.query.industry_id || 0);
    const rows = await opportunitiesRepo.listOpportunities(codeId);
    res.json(
      rows.map((row) => ({
        ...row,
        unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
      }))
    );
  }));

  router.get("/api/opportunities/unlocks", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(req.query.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（读侧保留 guest 兆底）
    const rows = await opportunitiesRepo.listUnlocks(userKey);
    res.json(rows);
  }));

  // ── 精选数据按需翻译：镜像 /api/notices/:id/translation，读写 crm_opportunity_translations；
  // 无英文中枢兜底（标题双语已由定时任务双表扫描覆盖）
  router.get("/api/opportunities/:id/translation", asyncHandler(async (req, res) => {
    try {
    const opportunityId = Number(req.params.id);
    const lang = String(req.query.lang || "").toLowerCase();
    if (!opportunityId || !NOTICE_TRANSLATION_LANGS[lang]) {
      return res.status(400).json({ error: "INVALID_OPPORTUNITY_OR_LANG" });
    }

    const cachedRow = await opportunitiesRepo.findTranslationCache(opportunityId, lang);
    if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
      return res.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
    }

    const opp = await opportunitiesRepo.findTextById(opportunityId);
    if (!opp) return res.status(404).json({ error: "OPPORTUNITY_NOT_FOUND" });

    const pendingKey = `opp:${opportunityId}:${lang}`;
    let pending = pendingNoticeTranslations.get(pendingKey);
    if (!pending) {
      pending = translateNoticeViaChain(String(opp.title || ""), String(opp.description || ""), lang);
      pendingNoticeTranslations.set(pendingKey, pending);
      pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
    }
    const started = Date.now();
    const { translations, provider, degradedFrom } = await pending;
    // 结构化日志：与公告详情端点同款，含降级轨迹
    console.log(
      `[translate] target=opp:${opportunityId} lang=${lang} provider=${provider} ms=${Date.now() - started} degraded=${degradedFrom?.join(",") || "-"}`
    );

    if (provider === "same-lang-passthrough") {
      // passthrough 结果不入 crm_opportunity_translations，直接透传原文（同公告端点守卫）
      return res.json({ lang, title: translations[0], description: translations[1], cached: false, passthrough: true });
    }

    await opportunitiesRepo.upsertTranslation(opportunityId, lang, translations[0], translations[1], provider);
    res.json({ lang, title: translations[0], description: translations[1], cached: false });
    } catch (err: any) {
      if (err?.message === "TRANSLATION_UNAVAILABLE") {
        throw new HttpError(503, "TRANSLATION_UNAVAILABLE");
      }
      throw err;
    }
  }));

  router.post("/api/opportunities/:id/view", asyncHandler(async (req, res) => {
    const opportunityId = Number(req.params.id);
    const userKey = normalizeUserKey(req.body.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（浏览流水保留 guest）
    await opportunitiesRepo.insertView({
      userKey,
      opportunityId,
      ip: req.ip || req.socket?.remoteAddress || "127.0.0.1",
    });
    await opportunitiesRepo.incrementViewCount(opportunityId);
    res.json({ success: true });
  }));

  router.post("/api/opportunities/:id/unlock", asyncHandler(async (req, res) => {
    const opportunityId = Number(req.params.id);
    // 本地差异 #7：F.1——同 notices unlock：流水保留 guest，兴趣码仅实名写入
    const normalizedUserKey = normalizeUserKey(req.body.user_key);
    const userKey = normalizedUserKey || "guest";
    const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
      ? req.body.unlock_type
      : "free";
    const price = unlockType === "single" ? Number(req.body.price || 19) : 0;

    const existing = await opportunitiesRepo.findExistingUnlock(userKey, opportunityId);
    if (existing) {
      return res.json({ success: true, alreadyUnlocked: true });
    }

    if (unlockType === "free") {
      // 免费配额统一读 crm_membership_plans（与 /api/notices/:id/unlock 同源），不再硬编码
      const freeQuota = await membershipRepo.getFreeQuota();
      if (await membershipRepo.countFreeUnlocks(userKey) >= freeQuota) {
        return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
      }
    }

    const opp = await opportunitiesRepo.findById(opportunityId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });
    const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

    await opportunitiesRepo.insertUnlock({ userKey, opportunityId, unlockType, price, unspscSnapshot: JSON.stringify(snapshot) });
    await opportunitiesRepo.incrementUnlockCount(opportunityId);

    // 本地差异 #7：F.1——guest 拒写兴趣码（解锁流水已保留）
    // 修复：统一使用 persistUserInterestCodes，与公告解锁路径保持一致（白名单校验 + 权重上限 + 前缀展开）
    if (normalizedUserKey) {
      await persistUserInterestCodes(ctx.dbPool, normalizedUserKey, snapshot, "unlock_order", 2.50).catch(() => {});
    }

    res.status(201).json({ success: true, unlock_type: unlockType });
  }));

  return router;
}
