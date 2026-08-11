/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { hashPassword, verifyPassword, needsUpgrade, buildUserResponse } from "../services/auth";
import { sendPasswordResetEmail, isEmailConfigured } from "../services/email";
import { validatePassword } from "../../src/shared/auth/passwordPolicy";

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
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.message });

    // BUG-A1 修复：先检查用户是否已存在，避免覆盖密码
    const existing = await usersRepo.findByKey(email);
    if (existing) {
      return res.status(409).json({ error: "该邮箱已注册" });
    }

    const created = await usersRepo.create({
      user_key: email,
      email,
      display_name: displayName,
      password_hash: await hashPassword(password),
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
    const hashType = user?.password_hash_type ?? "sha256";
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash, hashType))) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (user.account_status === "disabled" || user.account_status === "rejected") {
      return res.status(403).json({ error: "账号未通过审核或已停用" });
    }

    // 登录成功，清除失败计数
    clearLoginFailures(ip);

    // 透明升级：旧 SHA-256 用户登录成功后自动升级为 bcrypt
    if (needsUpgrade(hashType)) {
      const newHash = await hashPassword(password);
      await usersRepo.updatePassword(user.user_key, newHash, "bcrypt");
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

  // ── 找回密码：发送验证码 ──────────────────────────────────────────
  // IP 维度限流：每 IP 每小时最多 5 次
  const forgotPasswordAttempts = new Map<string, { count: number; resetAt: number }>();
  const FORGOT_WINDOW_MS = 60 * 60 * 1000; // 1 小时
  const FORGOT_MAX_SENDS = 5;

  function checkForgotRateLimit(ip: string): { blocked: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = forgotPasswordAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
      forgotPasswordAttempts.set(ip, { count: 0, resetAt: now + FORGOT_WINDOW_MS });
      return { blocked: false, retryAfterSec: 0 };
    }
    if (entry.count >= FORGOT_MAX_SENDS) {
      return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  function recordForgotPasswordSend(ip: string): void {
    const now = Date.now();
    const entry = forgotPasswordAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
      forgotPasswordAttempts.set(ip, { count: 1, resetAt: now + FORGOT_WINDOW_MS });
    } else {
      entry.count += 1;
    }
  }

  // 定期清理过期条目
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of forgotPasswordAttempts) {
      if (now > entry.resetAt) forgotPasswordAttempts.delete(ip);
    }
  }, 10 * 60 * 1000).unref();

  router.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

    // IP 限流
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({
        error: "发送过于频繁，请稍后重试",
        retry_after_seconds: rl.retryAfterSec,
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    // 邮箱格式校验
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    }

    // 检查邮件服务是否已配置
    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "邮件服务暂未配置，请联系客服重置密码" });
    }

    // 无论邮箱是否注册，都返回相同提示（防邮箱枚举攻击）
    const user = await usersRepo.findByKey(email);
    if (user) {
      // 生成 6 位验证码
      const code = String(crypto.randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 分钟有效

      // 写入验证码表
      const [insertResult] = await ctx.dbPool.execute(
        `INSERT INTO crm_password_resets (user_key, code, expires_at, ip)
         VALUES (?, ?, ?, ?)`,
        [email, code, expiresAt, ip],
      );
      const resetId = (insertResult as any).insertId;

      // 发送邮件（同步等待，记录发送状态）
      try {
        await sendPasswordResetEmail(email, code);
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET email_sent = 1 WHERE id = ?",
          [resetId],
        );
        console.log(`[forgot-password] ✓ 验证码邮件发送成功: ${email}`);
      } catch (err) {
        const errorMsg = (err as Error).message;
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET email_sent = 0, email_error = ? WHERE id = ?",
          [errorMsg, resetId],
        );
        console.error(`[forgot-password] ✗ 验证码邮件发送失败: ${email} - ${errorMsg}`);
      }

      recordForgotPasswordSend(ip);
    }

    // 统一响应（防枚举）
    res.json({ success: true, message: "验证码已发送到您的邮箱" });
  }));

  // ── 找回密码：重置密码 ──────────────────────────────────────────
  router.post("/api/auth/reset-password", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.new_password || "");

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "请填写完整信息" });
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    // 查询该邮箱最新的未使用、未过期验证码记录
    const [rows] = await ctx.dbPool.query(
      `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_key = ? AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const record = (rows as any[])[0];

    if (!record) {
      return res.status(400).json({ error: "验证码错误或已过期" });
    }
    if (record.attempts >= 5) {
      return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    }

    // 验证码匹配校验
    if (record.code !== code) {
      // 尝试次数 +1
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
        [record.id],
      );
      return res.status(400).json({ error: "验证码错误或已过期" });
    }

    // 验证码正确 → 重置密码（bcrypt）
    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(email, newHash, "bcrypt");
    await usersRepo.markEmailVerified(email);

    // 标记验证码已使用
    await ctx.dbPool.execute(
      "UPDATE crm_password_resets SET used = 1 WHERE id = ?",
      [record.id],
    );

    // 返回用户信息（自动登录）
    const user = await usersRepo.findAuthByKey(email);
    if (!user) {
      return res.status(500).json({ error: "重置成功，但获取用户信息失败，请重新登录" });
    }
    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    res.json({ success: true, user: payload });
  }));

  return router;
}
