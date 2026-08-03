/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { hashPassword, buildUserResponse } from "../services/auth";

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const usersRepo = ctx.usersRepo;
  const membershipRepo = ctx.membershipRepo;
  const suppliersRepo = ctx.suppliersRepo;

  router.post("/api/auth/register", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const displayName = String(req.body.display_name || email.split("@")[0] || "会员");
    if (!email || !password) return res.status(400).json({ error: "邮箱和密码不能为空" });
    if (password.length < 6) return res.status(400).json({ error: "密码至少 6 位" });

    await usersRepo.upsert({
      user_key: email,
      email,
      display_name: displayName,
      password_hash: hashPassword(password),
    });

    res.status(201).json({
      success: true,
      user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
    });
  }));

  router.post("/api/auth/login", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await usersRepo.findAuthByKey(email);
    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (user.account_status === "disabled" || user.account_status === "rejected") {
      return res.status(403).json({ error: "账号未通过审核或已停用" });
    }
    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    res.json({ success: true, user: payload });
  }));

  router.get("/api/auth/user", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

    const user = await usersRepo.findProfileByKey(userKey);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    res.json({ success: true, user: payload });
  }));

  return router;
}
