/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "fs";
import path from "path";
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { hashPassword, buildUserResponse } from "../services/auth";

// ── 速率限制器（登录防暴力破解）──
// P2-3 修复：内存 + 文件持久化，重启不丢失；以 IP 为 key，滑动窗口 15 分钟内最多 10 次失败
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟
const LOGIN_MAX_FAILS = 10;
const RATE_LIMIT_FILE = path.resolve(process.cwd(), "server/logs/.login-rate-limit.json");

// 启动时从文件恢复速率限制状态
try {
  if (fs.existsSync(RATE_LIMIT_FILE)) {
    const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, "utf-8"));
    const now = Date.now();
    for (const [ip, entry] of Object.entries(data as Record<string, { count: number; resetAt: number }>)) {
      if (entry.resetAt > now) loginAttempts.set(ip, entry);
    }
  }
} catch { /* 文件损坏或不存在，从空状态开始 */ }

/** 将当前速率限制状态持久化到文件（防抖：仅在有活跃条目时写入） */
function persistRateLimit(): void {
  try {
    if (loginAttempts.size === 0) {
      if (fs.existsSync(RATE_LIMIT_FILE)) fs.unlinkSync(RATE_LIMIT_FILE);
      return;
    }
    const dir = path.dirname(RATE_LIMIT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: Record<string, { count: number; resetAt: number }> = {};
    for (const [ip, entry] of loginAttempts) obj[ip] = entry;
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(obj), "utf-8");
  } catch { /* 写入失败不影响主服务 */ }
}

function checkLoginRateLimit(ip: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return { blocked: false, retryAfterSec: 0 };
  }
  if (entry.count >= LOGIN_MAX_FAILS) {
    return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
  // P2-3: 登录失败时持久化，确保重启后限制不丢失
  persistRateLimit();
}

function clearLoginFailures(ip: string): void {
  loginAttempts.delete(ip);
}

// 定期清理过期条目（防止内存泄漏）+ 持久化
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) { loginAttempts.delete(ip); changed = true; }
  }
  if (changed) persistRateLimit();
}, 5 * 60 * 1000).unref();

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

    // BUG-A1 修复：先检查用户是否已存在，避免覆盖密码
    const existing = await usersRepo.findByKey(email);
    if (existing) {
      return res.status(409).json({ error: "该邮箱已注册" });
    }

    const created = await usersRepo.create({
      user_key: email,
      email,
      display_name: displayName,
      password_hash: hashPassword(password),
    });

    if (!created) {
      return res.status(409).json({ error: "该邮箱已注册" });
    }

    res.status(201).json({
      success: true,
      user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
    });
  }));

  router.post("/api/auth/login", asyncHandler(async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

    // BUG-A3 修复：登录频率限制
    const rateLimit = checkLoginRateLimit(ip);
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: "登录尝试过于频繁，请稍后重试",
        retry_after_seconds: rateLimit.retryAfterSec,
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await usersRepo.findAuthByKey(email);
    if (!user || user.password_hash !== hashPassword(password)) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (user.account_status === "disabled" || user.account_status === "rejected") {
      return res.status(403).json({ error: "账号未通过审核或已停用" });
    }

    // 登录成功，清除失败计数
    clearLoginFailures(ip);

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
