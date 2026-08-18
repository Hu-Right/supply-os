/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { normalizeUnspscCodes, persistUserInterestCodes } from "../services/unspsc/index";
import { OpportunitiesRepo } from "../repos/opportunities.repo";
import { MembershipRepo } from "../repos/membership.repo";
import {
  NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations, translateNoticeViaChain,
} from "../services/translation/notice";

export function createOpportunitiesRouter(ctx: AppContext): Router {
  const router = Router();
  const opportunitiesRepo = ctx.opportunitiesRepo ?? new OpportunitiesRepo(ctx.dbPool);
  // 双轨制退役（轨道A）：membershipRepo 统一走领域上下文（bootstrap 保证注入，移除 ?? 兜底）
  const membershipRepo = ctx.payment.membershipRepo;

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

  // P0-5 安全修复：解锁列表必须 JWT 认证
  router.get("/api/opportunities/unlocks", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "guest";
    const rows = await opportunitiesRepo.listUnlocks(userKey);
    res.json(rows);
  }));

  // ── 精选数据按需翻译：镜像 /api/notices/:id/translation，读写 crm_opportunity_translations；
  // 无英文中枢兜底（标题双语已由定时任务双表扫描覆盖）
  // P2-9 安全修复：翻译端点必须认证，防止成本攻击
  router.get("/api/opportunities/:id/translation", requireAuth, asyncHandler(async (req, res) => {
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

  // P0-4 安全修复：商机解锁必须 JWT 认证 + entitlement 校验
  router.post("/api/opportunities/:id/unlock", requireAuth, asyncHandler(async (req, res) => {
    const opportunityId = Number(req.params.id);
    const userKey = req.userKey || "guest";
    const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
      ? req.body.unlock_type
      : "free";
    const price = unlockType === "single" ? Number(req.body.price || 19) : 0;

    const existing = await opportunitiesRepo.findExistingUnlock(userKey, opportunityId);
    if (existing) {
      return res.json({ success: true, alreadyUnlocked: true });
    }

    if (unlockType === "free") {
      const freeQuota = await membershipRepo.getFreeQuota();
      if (await membershipRepo.countFreeUnlocks(userKey) >= freeQuota) {
        return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
      }
    }

    // P0-4 安全修复：single/subscription 必须校验 entitlement 余量
    if (unlockType === "subscription" || unlockType === "single") {
      const [entRows] = await ctx.dbPool.query(
        `SELECT id FROM crm_user_entitlements
         WHERE user_key = ? AND status = 'active' AND is_upgraded = 0 AND quota_total > quota_used
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [userKey],
      );
      if ((entRows as any[]).length === 0) {
        return res.status(402).json({ error: "PAID_QUOTA_REQUIRED" });
      }
    }

    const opp = await opportunitiesRepo.findById(opportunityId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });
    const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

    await opportunitiesRepo.insertUnlock({ userKey, opportunityId, unlockType, price, unspscSnapshot: JSON.stringify(snapshot) });
    await opportunitiesRepo.incrementUnlockCount(opportunityId);

    if (userKey !== "guest") {
      await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "unlock_order", 2.50).catch(() => {});
    }

    res.status(201).json({ success: true, unlock_type: unlockType });
  }));

  return router;
}
