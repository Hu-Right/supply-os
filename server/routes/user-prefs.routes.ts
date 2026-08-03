/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";

export function createUserPrefsRouter(ctx: AppContext): Router {
  const router = Router();
  const userPrefsRepo = ctx.userPrefsRepo;

  router.get("/api/user/industry-prefs", asyncHandler(async (req, res) => {
      const userKey = normalizeUserKey(req.query.user_key) || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const prefs = await userPrefsRepo.getIndustryPrefs(userKey);
      res.json({ prefs: prefs || null });
  }));

  router.post("/api/user/industry-prefs", asyncHandler(async (req, res) => {
      const userKey = normalizeUserKey(req.body.user_key) || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const levels = [1, 2, 3, 4, 5].map((n) => {
        const value = Number(req.body[`level${n}_id`] || 0);
        return Number.isInteger(value) && value > 0 ? value : null;
      });
      if (!levels[0]) {
        await userPrefsRepo.deleteIndustryPrefs(userKey);
        return res.json({ success: true, cleared: true });
      }
      await userPrefsRepo.upsertIndustryPrefs(userKey, levels);
      res.status(201).json({ success: true });
  }));

  return router;
}
