/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { sendError, ApiErrorCode } from "../utils/http-error";
import { invalidateUnifiedSearchCache } from "../services/search-orchestrator/index";

export function createUserPrefsRouter(ctx: AppContext): Router {
  const router = Router();
  const userPrefsRepo = ctx.user.userPrefsRepo;

  // P0-5 安全修复：行业偏好读写必须 JWT 认证
  router.get("/api/user/industry-prefs", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "";
      if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
      const prefs = await userPrefsRepo.getIndustryPrefs(userKey);
      res.json({ prefs: prefs || null });
  }));

  router.post("/api/user/industry-prefs", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "";
      if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
      const levels = [1, 2, 3, 4, 5].map((n) => {
        const value = Number(req.body[`level${n}_id`] || 0);
        return Number.isInteger(value) && value > 0 ? value : null;
      });
      if (!levels[0]) {
        await userPrefsRepo.deleteIndustryPrefs(userKey);
        invalidateUnifiedSearchCache(userKey); // 行业已清除：失效编排器缓存，下次立即按新状态匹配
        return res.json({ success: true, cleared: true });
      }
      await userPrefsRepo.upsertIndustryPrefs(userKey, levels);
      invalidateUnifiedSearchCache(userKey); // 行业已变更：失效编排器缓存，下次立即按新行业匹配
      res.status(201).json({ success: true });
  }));

  return router;
}
