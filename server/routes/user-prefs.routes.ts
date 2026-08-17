/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { invalidateIndustryMatchCache } from "../services/industry-match";
import { invalidateUnifiedSearchCache } from "../services/search-orchestrator/index";

export function createUserPrefsRouter(ctx: AppContext): Router {
  const router = Router();
  const userPrefsRepo = ctx.userPrefsRepo;

  // P0-5 安全修复：行业偏好读写必须 JWT 认证
  router.get("/api/user/industry-prefs", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const prefs = await userPrefsRepo.getIndustryPrefs(userKey);
      res.json({ prefs: prefs || null });
  }));

  router.post("/api/user/industry-prefs", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const levels = [1, 2, 3, 4, 5].map((n) => {
        const value = Number(req.body[`level${n}_id`] || 0);
        return Number.isInteger(value) && value > 0 ? value : null;
      });
      if (!levels[0]) {
        await userPrefsRepo.deleteIndustryPrefs(userKey);
        invalidateIndustryMatchCache(userKey); // 行业已清除：失效匹配缓存
        invalidateUnifiedSearchCache(userKey); // 同步失效统一编排器缓存（重构方案 §5）
        return res.json({ success: true, cleared: true });
      }
      await userPrefsRepo.upsertIndustryPrefs(userKey, levels);
      invalidateIndustryMatchCache(userKey); // 行业已变更：失效匹配缓存，下次立即按新行业匹配
      invalidateUnifiedSearchCache(userKey); // 同步失效统一编排器缓存（重构方案 §5）
      res.status(201).json({ success: true });
  }));

  return router;
}
