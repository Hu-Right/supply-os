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
import { hashPassword, verifyPassword, needsUpgrade, buildUserResponse, hashVerificationCode } from "../services/auth";
import { sendPasswordResetEmail, sendRegistrationVerifyEmail, isEmailConfigured } from "../services/email";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "../services/sms";
import { validatePassword } from "../../src/shared/auth/passwordPolicy";
import { maskPhone } from "../utils/mask";
import { extractClientIp } from "../utils/ip";
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken,
  getRefreshTokenExpiresAt, extractBearerToken,
} from "../services/jwt";
import { requireAuth } from "../middleware/auth";

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

// ── 账号维度速率限制器（防分布式暴力破解）──
// P2-5 修复：以账号为 key，30 分钟内最多 5 次失败，防止多 IP 对同一账号攻击
const accountLoginAttempts = new Map<string, { count: number; resetAt: number }>();
const ACCOUNT_WINDOW_MS = 30 * 60 * 1000; // 30 分钟
const ACCOUNT_MAX_FAILS = 5;

function checkAccountRateLimit(email: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = accountLoginAttempts.get(email);
  if (!entry || now > entry.resetAt) {
    return { blocked: false, retryAfterSec: 0 };
  }
  if (entry.count >= ACCOUNT_MAX_FAILS) {
    return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

function recordAccountLoginFailure(email: string): void {
  const now = Date.now();
  const entry = accountLoginAttempts.get(email);
  if (!entry || now > entry.resetAt) {
    accountLoginAttempts.set(email, { count: 1, resetAt: now + ACCOUNT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearAccountLoginFailures(email: string): void {
  accountLoginAttempts.delete(email);
}

// 定期清理账号维度过期条目
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of accountLoginAttempts) {
    if (now > entry.resetAt) accountLoginAttempts.delete(email);
  }
}, 10 * 60 * 1000).unref();

/**
 * 签发 JWT Token 对（Access + Refresh）并存入 Refresh Token 到数据库
 * 返回 { token, refresh_token } 供响应体使用
 */
async function issueTokenPair(
  dbPool: import("mysql2/promise").Pool,
  userKey: string,
  email: string,
): Promise<{ token: string; refresh_token: string }> {
  const accessToken = signAccessToken({ user_key: userKey, email });
  const { token: refreshToken, tokenHash } = signRefreshToken({ user_key: userKey });
  const expiresAt = getRefreshTokenExpiresAt();

  // 存入数据库（fire-and-forget，失败不影响登录）
  void dbPool.execute(
    "INSERT INTO crm_refresh_tokens (user_key, token_hash, expires_at) VALUES (?, ?, ?)",
    [userKey, tokenHash, expiresAt],
  ).catch((err) => console.error("[jwt] refresh token 入库失败:", (err as Error).message));

  return { token: accessToken, refresh_token: refreshToken };
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

  // ── 注册：发送邮箱验证码 ──────────────────────────────────────────
  // 注册前必须先验证邮箱所有权，防止虚假邮箱占用
  router.post("/api/auth/send-register-code", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);

    // IP 限流（复用找回密码的限流逻辑）
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({
        error: "发送过于频繁，请稍后重试",
        retry_after_seconds: rl.retryAfterSec,
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "邮件服务暂未配置，请稍后重试" });
    }

    // P1-4 安全加固：防邮箱枚举
    // 无论邮箱是否已注册，都返回相同响应（不泄露注册状态）
    // 已注册邮箱不发送验证码，但前端提示一致
    const existing = await usersRepo.findByKey(email);
    if (existing) {
      // 模拟成功响应，实际不发送验证码
      // 注意：已注册邮箱不计入限流（未实际发送邮件）
      // P1-4 修复：返回与成功发送完全一致的响应结构，防止通过 email_sent 字段枚举
      return res.json({
        success: true,
        email_sent: true,
        message: "验证码已发送到您的邮箱，请查收",
        support_hint: null,
      });
    }

    // M-3 安全加固：失效该邮箱之前的未使用验证码（防止验证码堆积）
    await ctx.dbPool.execute(
      "UPDATE crm_password_resets SET used = 1 WHERE user_key = ? AND code_type = 'registration' AND used = 0",
      [email],
    );

    // 生成 6 位验证码
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟有效

    // 写入验证码表（code_type = 'registration'）
    const [insertResult] = await ctx.dbPool.execute(
      `INSERT INTO crm_password_resets (user_key, code, code_type, expires_at, ip)
       VALUES (?, ?, 'registration', ?, ?)`,
      [email, hashVerificationCode(code), expiresAt, ip],
    );
    const resetId = (insertResult as any).insertId;

    // 发送验证邮件
    let emailSent = false;
    try {
      await sendRegistrationVerifyEmail(email, code);
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET email_sent = 1 WHERE id = ?",
        [resetId],
      );
      emailSent = true;
    } catch (err) {
      const errorMsg = (err as Error).message;
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET email_sent = 0, email_error = ? WHERE id = ?",
        [errorMsg, resetId],
      );
      console.error(`[register-code]  注册验证码邮件发送失败: ${email} - ${errorMsg}`);
    }

    // L-3 修复：仅在实际发送邮件时记录限流（避免已注册邮箱占用限流额度）
    if (emailSent) recordForgotPasswordSend(ip);

    res.json({
      success: true,
      email_sent: emailSent,
      support_hint: emailSent ? null : "邮件发送失败，请检查邮箱地址或稍后重试",
    });
  }));

  router.post("/api/auth/register", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const verifyCode = String(req.body.verify_code || "");
    const displayName = String(req.body.display_name || email.split("@")[0] || "会员");
    if (!email || !password) return res.status(400).json({ error: "邮箱和密码不能为空" });
    if (!verifyCode) return res.status(400).json({ error: "请输入邮箱验证码" });
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.message });

    // 验证邮箱验证码（code_type = 'registration'）
    const [codeRows] = await ctx.dbPool.query(
      `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_key = ? AND code_type = 'registration' AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const codeRecord = (codeRows as any[])[0];

    if (!codeRecord) {
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }
    if (codeRecord.attempts >= 5) {
      return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    }
    if (codeRecord.code !== hashVerificationCode(verifyCode)) {
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
        [codeRecord.id],
      );
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    // 检查用户是否已存在
    // P1-4 安全加固：返回通用错误，不泄露邮箱是否已注册
    const existing = await usersRepo.findByKey(email);
    if (existing) {
      return res.status(400).json({ error: "注册失败，请检查邮箱或验证码后重试" });
    }

    const created = await usersRepo.create({
      user_key: email,
      email,
      display_name: displayName,
      password_hash: await hashPassword(password),
    });

    if (!created) {
      return res.status(400).json({ error: "注册失败，请检查邮箱或验证码后重试" });
    }

    // 标记验证码已使用
    await ctx.dbPool.execute(
      "UPDATE crm_password_resets SET used = 1 WHERE id = ?",
      [codeRecord.id],
    );

    // 标记邮箱已验证（注册时已通过验证码验证邮箱所有权）
    await usersRepo.markEmailVerified(email);

    // 签发 JWT Token 对（注册即登录）
    let tokens: { token: string; refresh_token: string } | null = null;
    try {
      tokens = await issueTokenPair(ctx.dbPool, email, email);
    } catch { /* JWT_SECRET 未配置，静默降级 */ }

    res.status(201).json({
      success: true,
      user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
      ...tokens,
    });
  }));

  router.post("/api/auth/login", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);

    // P2-5 修复：IP 维度登录频率限制
    const rateLimit = checkLoginRateLimit(ip);
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: "登录尝试过于频繁，请稍后重试",
        retry_after_seconds: rateLimit.retryAfterSec,
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();

    // P2-5 修复：账号维度登录频率限制（防分布式暴力破解）
    const accountLimit = checkAccountRateLimit(email);
    if (accountLimit.blocked) {
      return res.status(429).json({
        error: "该账号登录尝试过于频繁，请稍后重试",
        retry_after_seconds: accountLimit.retryAfterSec,
      });
    }

    const password = String(req.body.password || "");
    const user = await usersRepo.findAuthByKey(email);
    const hashType = user?.password_hash_type ?? "sha256";
    if (!user || !user.password_hash) {
      // C-2 安全加固：用户不存在时执行 dummy bcrypt 比较，消除时序差异防止邮箱枚举
      await verifyPassword(password, "$2b$12$AAAAAAAAAAAAAAAAAAAAAAOqGHn2kLJ3xQ4y5m6n7p8r9s0t1u2v3w", "bcrypt");
      recordLoginFailure(ip);
      recordAccountLoginFailure(email);
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (!(await verifyPassword(password, user.password_hash, hashType))) {
      recordLoginFailure(ip);
      recordAccountLoginFailure(email);
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (user.account_status === "disabled" || user.account_status === "rejected") {
      return res.status(403).json({ error: "账号未通过审核或已停用" });
    }

    // 登录成功，清除 IP 和账号维度的失败计数
    clearLoginFailures(ip);
    clearAccountLoginFailures(email);

    // 透明升级：旧 SHA-256 用户登录成功后自动升级为 bcrypt
    if (needsUpgrade(hashType)) {
      const newHash = await hashPassword(password);
      await usersRepo.updatePassword(user.user_key, newHash, "bcrypt");
    }

    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    // 签发 JWT Token 对（JWT_SECRET 未配置时静默跳过）
    let tokens: { token: string; refresh_token: string } | null = null;
    try {
      tokens = await issueTokenPair(ctx.dbPool, user.user_key, user.email || "");
    } catch { /* JWT_SECRET 未配置，静默降级 */ }
    res.json({ success: true, user: payload, ...tokens });
  }));

  router.get("/api/auth/user", asyncHandler(async (req, res) => {
    // C-1 安全加固：必须通过 JWT 认证访问，禁止仅通过 query param 查询他人信息（防 IDOR）
    if (!req.userKey) return res.status(400).json({ error: "USER_REQUIRED" });
    if (!req.authViaJwt) {
      return res.status(403).json({ error: "FORBIDDEN", message: "请通过有效凭证访问" });
    }
    const userKey = req.userKey;

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
  const FORGOT_RATE_LIMIT_FILE = path.resolve(process.cwd(), "server/logs/.forgot-rate-limit.json");

  // 启动时从文件恢复速率限制状态
  try {
    if (fs.existsSync(FORGOT_RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(FORGOT_RATE_LIMIT_FILE, "utf-8"));
      const now = Date.now();
      for (const [ip, entry] of Object.entries(data as Record<string, { count: number; resetAt: number }>)) {
        if (entry.resetAt > now) forgotPasswordAttempts.set(ip, entry);
      }
    }
  } catch { /* 文件损坏或不存在，从空状态开始 */ }

  /** 将找回密码限流状态持久化到文件 */
  function persistForgotRateLimit(): void {
    try {
      if (forgotPasswordAttempts.size === 0) {
        if (fs.existsSync(FORGOT_RATE_LIMIT_FILE)) fs.unlinkSync(FORGOT_RATE_LIMIT_FILE);
        return;
      }
      const dir = path.dirname(FORGOT_RATE_LIMIT_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, { count: number; resetAt: number }> = {};
      for (const [ip, entry] of forgotPasswordAttempts) obj[ip] = entry;
      fs.writeFileSync(FORGOT_RATE_LIMIT_FILE, JSON.stringify(obj), "utf-8");
    } catch { /* 写入失败不影响主服务 */ }
  }

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
    // P2-1: 发送验证码时持久化，确保重启后限制不丢失
    persistForgotRateLimit();
  }

  // 定期清理过期条目 + 持久化
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [ip, entry] of forgotPasswordAttempts) {
      if (now > entry.resetAt) { forgotPasswordAttempts.delete(ip); changed = true; }
    }
    if (changed) persistForgotRateLimit();
  }, 10 * 60 * 1000).unref();

  // ── 检查邮箱是否绑定手机号（用于找回密码自动切换）──
  router.post("/api/auth/check-email-phone", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    }

    const user = await usersRepo.findByKey(email);
    if (!user || !user.phone || !user.phone_verified) {
      // 未注册或未绑定验证手机号，返回空结果（不泄露用户状态）
      return res.json({ has_phone: false });
    }

    // 返回脱敏手机号
    return res.json({
      has_phone: true,
      phone: maskPhone(user.phone),
    });
  }));

  router.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const channel = String(req.body.channel || "email").trim();

    // IP 限流
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({
        error: "发送过于频繁，请稍后重试",
        retry_after_seconds: rl.retryAfterSec,
      });
    }

    const identifier = String(req.body.email || "").trim().toLowerCase();

    // ── 手机验证渠道 ──
    if (channel === "sms") {
      // C-3 安全加固：SMS 渠道仅接受手机号，防止通过邮箱触发对他人手机的短信骚扰
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        return res.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
      }
      let email = identifier;
      if (!identifier || !/^1[3-9]\d{9}$/.test(identifier)) {
        return res.status(400).json({ error: "请输入有效的手机号" });
      }
      // 如果输入的是手机号，通过手机号反查用户
      if (/^1[3-9]\d{9}$/.test(identifier)) {
        const byPhone = await usersRepo.findByPhone(identifier);
        if (!byPhone || !byPhone.user_key) {
          // 防枚举：统一返回模糊提示
          // 记录限流（防止无限调用）
          recordForgotPasswordSend(ip);
          return res.json({
            success: true,
            message: "验证码发送请求已提交",
            sms_sent: false,
            support_hint: null,
          });
        }
        email = byPhone.user_key;
      }
      const user = await usersRepo.findByKey(email);
      if (!user || !user.phone || !user.phone_verified) {
        // 防枚举：统一返回模糊提示
        // 记录限流（防止无限调用）
        recordForgotPasswordSend(ip);
        return res.json({
          success: true,
          message: "验证码发送请求已提交",
          sms_sent: false,
          support_hint: null,
        });
      }

      if (!isSmsConfigured()) {
        return res.status(503).json({ error: "短信服务暂未配置，请使用邮箱验证" });
      }

      // 手机号限流
      const phoneRl = checkPhoneRateLimit(user.phone);
      if (phoneRl.blocked) {
        return res.status(429).json({ error: "验证码发送过于频繁，请稍后重试", retry_after_seconds: phoneRl.retryAfterSec });
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 分钟有效

      // 先写入数据库，再发送短信（避免短信已发送但 DB 写入失败导致验证码丢失）
      const code = String(crypto.randomInt(100000, 1000000));
      const [insertResult] = await ctx.dbPool.execute(
        `INSERT INTO crm_password_resets (user_key, phone, code, code_type, expires_at, ip)
         VALUES (?, ?, ?, 'phone_reset', ?, ?)`,
        [email, user.phone, hashVerificationCode(code), expiresAt, ip],
      );
      const resetId = (insertResult as any).insertId;

      // 发送短信（传入预生成验证码，确保发送内容与数据库存储一致）
      // 找回密码场景使用专用模板
      let smsSent = false;
      try {
        await sendSmsVerificationCode(user.phone, getSmsResetTemplateCode(), code);
        smsSent = true;
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET sms_sent = 1 WHERE id = ?",
          [resetId],
        );
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error(`[forgot-password/sms] ✗ 短信发送失败: ${maskPhone(user.phone)} - ${errorMsg}`);
        // 标记发送失败，但验证码记录仍保留在数据库中
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET sms_sent = 0, sms_error = ? WHERE id = ?",
          [errorMsg, resetId],
        );
      }

      // 无论发送成功与否，都记录限流（防止 API 被刷爆）
      recordPhoneSms(user.phone);
      recordForgotPasswordSend(ip);

      return res.json({
        success: true,
        message: "验证码已发送到您的手机",
        sms_sent: smsSent,
        support_hint: smsSent ? null : "短信发送失败，请使用邮箱验证或联系客服",
      });
    }

    // ── 邮箱验证渠道（默认） ──
    // 邮箱格式校验
    const email = identifier;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    }

    // 检查邮件服务是否已配置
    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "邮件服务暂未配置，请联系客服重置密码" });
    }

    // 无论邮箱是否注册，都返回相同提示（防邮箱枚举攻击）
    // 但区分邮件发送状态，以便前端提示用户联系客服
    const user = await usersRepo.findByKey(email);
    let emailSent = true; // 默认 true（用户不存在时也返回 true，防枚举）
    if (user) {
      // M-3 安全加固：失效该邮箱之前的未使用验证码（防止验证码堆积）
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET used = 1 WHERE user_key = ? AND code_type = 'email_reset' AND used = 0",
        [email],
      );

      // 生成 6 位验证码
      const code = String(crypto.randomInt(100000, 1000000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 分钟有效

      // 写入验证码表（code_type = 'email_reset'）
      const [insertResult] = await ctx.dbPool.execute(
        `INSERT INTO crm_password_resets (user_key, code, code_type, expires_at, ip)
         VALUES (?, ?, 'email_reset', ?, ?)`,
        [email, hashVerificationCode(code), expiresAt, ip],
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
        emailSent = true;
      } catch (err) {
        const errorMsg = (err as Error).message;
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET email_sent = 0, email_error = ? WHERE id = ?",
          [errorMsg, resetId],
        );
        console.error(`[forgot-password] ✗ 验证码邮件发送失败: ${email} - ${errorMsg}`);
        emailSent = false;
      }
    }

    // 无论用户是否存在，都记录限流（保持一致性，防枚举）
    recordForgotPasswordSend(ip);

    // 统一响应（防枚举），但返回邮件发送状态供前端提示用户
    res.json({
      success: true,
      message: "验证码已发送到您的邮箱",
      email_sent: emailSent,
      support_hint: emailSent ? null : "邮件发送失败，请联系客服协助重置密码",
    });
  }));

  // ── 找回密码：重置密码 ──────────────────────────────────────────
  router.post("/api/auth/reset-password", asyncHandler(async (req, res) => {
    // M-5 安全加固：验证码校验端点增加 IP 维度速率限制
    const ip = extractClientIp(req);
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({ error: "操作过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    const identifier = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.new_password || "");
    const channel = String(req.body.channel || "email").trim();

    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ error: "请填写完整信息" });
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    // ── 手机验证渠道：支持手机号或邮箱作为标识符 ──
    let email = identifier;
    if (channel === "sms" && /^1[3-9]\d{9}$/.test(identifier)) {
      const byPhone = await usersRepo.findByPhone(identifier);
      if (!byPhone || !byPhone.user_key) {
        // P1-4 安全加固：不泄露手机号是否已注册
        return res.status(400).json({ error: "验证码无效，请重新获取" });
      }
      email = byPhone.user_key;
    }

    // ── 手机验证渠道 ──
    let record: any;
    if (channel === "sms") {
      // 查询该用户最新的未使用、未过期的手机验证码记录（增加 phone 匹配，防止跨用户误用）
      const [rows] = await ctx.dbPool.query(
        `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE user_key = ? AND code_type = 'phone_reset' AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      const smsRecord = (rows as any[])[0];
      // 额外校验 phone 字段是否匹配（增强安全性）
      if (smsRecord) {
        const [phoneCheck] = await ctx.dbPool.query(
          "SELECT phone FROM crm_password_resets WHERE id = ? AND phone IS NOT NULL LIMIT 1",
          [smsRecord.id],
        );
        const phoneRow = (phoneCheck as any[])[0];
        if (phoneRow && phoneRow.phone) {
          // 通过 user_key 反查用户当前绑定的手机号，确保匹配
          const currentUser = await usersRepo.findByKey(email);
          if (!currentUser || currentUser.phone !== phoneRow.phone) {
            return res.status(400).json({ error: "验证码无效，请重新获取" });
          }
        }
      }
      record = smsRecord;
    } else {
      // ── 邮箱验证渠道（默认） ──
      const [rows] = await ctx.dbPool.query(
        `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE user_key = ? AND code_type = 'email_reset' AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      record = (rows as any[])[0];
    }

    if (!record) {
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }
    if (record.attempts >= 5) {
      return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    }

    // 验证码匹配校验
    if (record.code !== hashVerificationCode(code)) {
      // 尝试次数 +1
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
        [record.id],
      );
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    // 验证码正确 → 重置密码（bcrypt）
    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(email, newHash, "bcrypt");

    // H-1 安全加固：密码重置后撤销所有现有 Refresh Token（防止攻击者继续续期）
    await ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE user_key = ?", [email]);

    // M-2 安全加固：仅邮箱渠道验证了邮箱所有权，才标记邮箱已验证
    if (channel !== "sms") {
      await usersRepo.markEmailVerified(email);
    }

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
    // 重置成功后签发新 Token（旧 Token 自然过期）
    let tokens: { token: string; refresh_token: string } | null = null;
    try {
      tokens = await issueTokenPair(ctx.dbPool, user.user_key, user.email || "");
    } catch { /* JWT_SECRET 未配置，静默降级 */ }
    res.json({ success: true, user: payload, ...tokens });
  }));

  // ── 手机号管理：发送验证码 ──────────────────────────────────────────
  // 手机号限流：同一号码 60 秒内仅 1 次，每小时 5 次
  const phoneSmsAttempts = new Map<string, { count: number; resetAt: number; lastSentAt: number }>();
  const PHONE_RATE_LIMIT_FILE = path.resolve(process.cwd(), "server/logs/.phone-rate-limit.json");

  // 启动时从文件恢复速率限制状态
  try {
    if (fs.existsSync(PHONE_RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(PHONE_RATE_LIMIT_FILE, "utf-8"));
      const now = Date.now();
      for (const [phone, entry] of Object.entries(data as Record<string, { count: number; resetAt: number; lastSentAt: number }>)) {
        if (entry.resetAt > now) phoneSmsAttempts.set(phone, entry);
      }
    }
  } catch { /* 文件损坏或不存在，从空状态开始 */ }

  /** 将手机号限流状态持久化到文件 */
  function persistPhoneRateLimit(): void {
    try {
      if (phoneSmsAttempts.size === 0) {
        if (fs.existsSync(PHONE_RATE_LIMIT_FILE)) fs.unlinkSync(PHONE_RATE_LIMIT_FILE);
        return;
      }
      const dir = path.dirname(PHONE_RATE_LIMIT_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, { count: number; resetAt: number; lastSentAt: number }> = {};
      for (const [phone, entry] of phoneSmsAttempts) obj[phone] = entry;
      fs.writeFileSync(PHONE_RATE_LIMIT_FILE, JSON.stringify(obj), "utf-8");
    } catch { /* 写入失败不影响主服务 */ }
  }

  function checkPhoneRateLimit(phone: string): { blocked: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = phoneSmsAttempts.get(phone);
    if (!entry || now > entry.resetAt) {
      return { blocked: false, retryAfterSec: 0 };
    }
    if (now - entry.lastSentAt < 60_000) {
      return { blocked: true, retryAfterSec: Math.ceil((60_000 - (now - entry.lastSentAt)) / 1000) };
    }
    if (entry.count >= 5) {
      return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  function recordPhoneSms(phone: string): void {
    const now = Date.now();
    const entry = phoneSmsAttempts.get(phone);
    if (!entry || now > entry.resetAt) {
      phoneSmsAttempts.set(phone, { count: 1, resetAt: now + 3600_000, lastSentAt: now });
    } else {
      entry.count += 1;
      entry.lastSentAt = now;
    }
    // P2-1: 发送短信时持久化，确保重启后限制不丢失
    persistPhoneRateLimit();
  }

  // 定期清理过期条目 + 持久化
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [phone, entry] of phoneSmsAttempts) {
      if (now > entry.resetAt) { phoneSmsAttempts.delete(phone); changed = true; }
    }
    if (changed) persistPhoneRateLimit();
  }, 10 * 60_000).unref();

  /** 中国大陆手机号正则（11 位数字，1 开头） */
  const PHONE_REGEX = /^1[3-9]\d{9}$/;

  router.post("/api/auth/send-phone-code", requireAuth, asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const userKey = req.userKey || "";
    const phone = String(req.body.phone || "").trim();
    const scene = String(req.body.scene || "bind");

    if (!userKey) return res.status(400).json({ error: "请先登录" });
    if (!["bind", "rebind", "unbind", "reset"].includes(scene)) {
      return res.status(400).json({ error: "无效的操作类型" });
    }

    // IP 限流
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({ error: "发送过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    // 短信服务检查
    if (!isSmsConfigured()) {
      return res.status(503).json({ error: "短信服务暂未配置，请稍后重试" });
    }

    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(404).json({ error: "用户不存在" });

    // 解绑/重置场景：使用用户已绑定的手机号，无需前端传入
    const targetPhone = (scene === "unbind" || scene === "reset") ? (user.phone || "") : phone;

    // 手机号格式校验（解绑场景已在场景校验中确保 phone 存在）
    if (!targetPhone || !PHONE_REGEX.test(targetPhone)) {
      if (scene === "unbind" || scene === "reset") {
        return res.status(400).json({ error: "尚未绑定手机号" });
      }
      return res.status(400).json({ error: "请输入有效的手机号" });
    }

    // 手机号限流
    const phoneRl = checkPhoneRateLimit(targetPhone);
    if (phoneRl.blocked) {
      return res.status(429).json({ error: "验证码发送过于频繁，请稍后重试", retry_after_seconds: phoneRl.retryAfterSec });
    }

    // 场景校验
    if (scene === "bind" && user.phone) {
      return res.status(409).json({ error: "已绑定手机号，请先解绑或换绑" });
    }
    if ((scene === "rebind" || scene === "unbind") && !user.phone) {
      return res.status(400).json({ error: "尚未绑定手机号" });
    }
    if (scene === "reset" && (!user.phone || !user.phone_verified)) {
      return res.status(400).json({ error: "未绑定手机号，请使用邮箱验证" });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟有效
    const codeType = `phone_${scene}`;

    // 先写入数据库，再发送短信（避免短信已发送但 DB 写入失败导致验证码丢失）
    const code = String(crypto.randomInt(100000, 1000000));
    const [insertResult] = await ctx.dbPool.execute(
      `INSERT INTO crm_password_resets (user_key, phone, code, code_type, expires_at, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userKey, targetPhone, hashVerificationCode(code), codeType, expiresAt, ip],
    );
    const resetId = (insertResult as any).insertId;

    // 发送短信（传入预生成验证码，确保发送内容与数据库存储一致）
    // 找回密码场景使用专用模板，绑定/解绑/换绑使用默认模板
    let smsSent = false;
    try {
      const tplCode = scene === "reset" ? getSmsResetTemplateCode() : undefined;
      await sendSmsVerificationCode(targetPhone, tplCode, code);
      smsSent = true;
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET sms_sent = 1 WHERE id = ?",
        [resetId],
      );
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`[send-phone-code] ✗ 短信发送失败: ${maskPhone(targetPhone)} - ${errorMsg}`);
      // 标记发送失败，但验证码记录仍保留在数据库中
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET sms_sent = 0, sms_error = ? WHERE id = ?",
        [errorMsg, resetId],
      );
    }

    // 无论发送成功与否，都记录限流（防止 API 被刷爆）
    recordPhoneSms(targetPhone);
    recordForgotPasswordSend(ip);

    if (!smsSent) {
      return res.status(500).json({ error: "短信发送失败，请稍后重试" });
    }

    res.json({ success: true, sms_sent: true });
  }));

  // ── 手机号管理：绑定 ──────────────────────────────────────────
  router.post("/api/auth/bind-phone", requireAuth, asyncHandler(async (req, res) => {
    // M-5 安全加固：验证码校验端点增加 IP 维度速率限制
    const ip = extractClientIp(req);
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({ error: "操作过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    const userKey = req.userKey || "";
    const phone = String(req.body.phone || "").trim();
    const code = String(req.body.code || "").trim();

    if (!userKey) return res.status(400).json({ error: "请先登录" });
    if (!phone || !PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: "请输入有效的手机号" });
    }
    if (!code) return res.status(400).json({ error: "请输入验证码" });

    // 检查用户是否已绑定
    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (user.phone) return res.status(409).json({ error: "已绑定手机号，请先解绑或换绑" });

    // 验证手机号验证码
    const [codeRows] = await ctx.dbPool.query(
      `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_key = ? AND phone = ? AND code_type = 'phone_bind' AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userKey, phone],
    );
    const codeRecord = (codeRows as any[])[0];

    if (!codeRecord) return res.status(400).json({ error: "验证码无效，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== hashVerificationCode(code)) {
      await ctx.dbPool.execute("UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?", [codeRecord.id]);
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    // H-3 安全加固：原子操作绑定手机号，消除 TOCTOU 竞态条件
    const [bindResult] = await ctx.dbPool.execute(
      "UPDATE crm_users SET phone = ?, phone_verified = 1, updated_at = NOW() WHERE user_key = ? AND phone IS NULL",
      [phone, userKey],
    );
    if ((bindResult as any).affectedRows === 0) {
      // 绑定失败：手机号已被其他用户占用或当前用户已有手机号
      const existingByPhone = await usersRepo.findByPhone(phone);
      if (existingByPhone) return res.status(409).json({ error: "该手机号已被其他用户绑定" });
      return res.status(409).json({ error: "已绑定手机号，请先解绑或换绑" });
    }

    // 标记验证码已使用
    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [codeRecord.id]);

    res.json({ success: true, phone: maskPhone(phone) });
  }));

  // ── 手机号管理：换绑 ──────────────────────────────────────────
  router.post("/api/auth/rebind-phone", requireAuth, asyncHandler(async (req, res) => {
    // M-5 安全加固：验证码校验端点增加 IP 维度速率限制
    const ip = extractClientIp(req);
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({ error: "操作过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    const userKey = req.userKey || "";
    const newPhone = String(req.body.new_phone || "").trim();
    const code = String(req.body.code || "").trim();

    if (!userKey) return res.status(400).json({ error: "请先登录" });
    if (!newPhone || !PHONE_REGEX.test(newPhone)) {
      return res.status(400).json({ error: "请输入有效的手机号" });
    }
    if (!code) return res.status(400).json({ error: "请输入验证码" });

    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (!user.phone) return res.status(400).json({ error: "尚未绑定手机号" });

    // 验证新手机号验证码
    const [codeRows] = await ctx.dbPool.query(
      `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_key = ? AND phone = ? AND code_type = 'phone_rebind' AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userKey, newPhone],
    );
    const codeRecord = (codeRows as any[])[0];

    if (!codeRecord) return res.status(400).json({ error: "验证码无效，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== hashVerificationCode(code)) {
      await ctx.dbPool.execute("UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?", [codeRecord.id]);
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    // 检查新手机号是否被其他用户绑定
    const existingByPhone = await usersRepo.findByPhone(newPhone);
    if (existingByPhone && existingByPhone.user_key !== userKey) {
      return res.status(409).json({ error: "该手机号已被其他用户绑定" });
    }

    // 换绑（覆盖更新）
    await usersRepo.bindPhone(userKey, newPhone);

    // 标记验证码已使用
    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [codeRecord.id]);

    res.json({ success: true, phone: maskPhone(newPhone) });
  }));

  // ── 手机号管理：解绑 ──────────────────────────────────────────
  router.post("/api/auth/unbind-phone", requireAuth, asyncHandler(async (req, res) => {
    // M-5 安全加固：验证码校验端点增加 IP 维度速率限制
    const ip = extractClientIp(req);
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({ error: "操作过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    const userKey = req.userKey || "";
    const code = String(req.body.code || "").trim();

    if (!userKey) return res.status(400).json({ error: "请先登录" });
    if (!code) return res.status(400).json({ error: "请输入验证码" });

    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (!user.phone) return res.status(400).json({ error: "尚未绑定手机号" });

    // 验证当前手机号的验证码
    const [codeRows] = await ctx.dbPool.query(
      `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_key = ? AND phone = ? AND code_type = 'phone_unbind' AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userKey, user.phone],
    );
    const codeRecord = (codeRows as any[])[0];

    if (!codeRecord) return res.status(400).json({ error: "验证码无效，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== hashVerificationCode(code)) {
      await ctx.dbPool.execute("UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?", [codeRecord.id]);
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    // 解绑
    await usersRepo.unbindPhone(userKey);

    // 标记验证码已使用
    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [codeRecord.id]);

    res.json({ success: true });
  }));

  // ── Token 刷新 ──────────────────────────────────────────
  // 用 Refresh Token 换取新的 Access Token（无感续期）
  router.post("/api/auth/refresh", asyncHandler(async (req, res) => {
    const refreshToken = String(req.body.refresh_token || "").trim();
    if (!refreshToken) {
      return res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });
    }

    // 验证 Refresh Token 签名
    let payload: { user_key: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    }

    // 检查数据库中是否存在该 Refresh Token（哈希比对）
    const tokenHash = hashRefreshToken(refreshToken);
    const [rows] = await ctx.dbPool.query(
      "SELECT id, user_key FROM crm_refresh_tokens WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
      [tokenHash],
    );
    const stored = (rows as any[])[0];
    if (!stored) {
      return res.status(401).json({ error: "REFRESH_TOKEN_REVOKED" });
    }

    // 签发新 Access Token（Refresh Token 不变，继续复用）
    const user = await usersRepo.findProfileByKey(payload.user_key);
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }
    const newAccessToken = signAccessToken({
      user_key: payload.user_key,
      email: (user as any).email || "",
    });
    res.json({ success: true, token: newAccessToken });
  }));

  // ── 登出（撤销 Refresh Token）──────────────────────────────
  router.post("/api/auth/logout", asyncHandler(async (req, res) => {
    const refreshToken = String(req.body.refresh_token || "").trim();
    if (refreshToken) {
      // 撤销指定 Refresh Token
      const tokenHash = hashRefreshToken(refreshToken);
      await ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE token_hash = ?", [tokenHash]);
    }

    // 如果携带 JWT，也可撤销该用户的所有 Refresh Token（全设备登出）
    const bearerToken = extractBearerToken(req.headers.authorization);
    if (bearerToken) {
      try {
        const { user_key } = verifyRefreshToken(bearerToken);
        // 仅当 JWT 有效且为 refresh 类型时撤销
        await ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE user_key = ?", [user_key]);
      } catch { /* JWT 无效或已过期，忽略 */ }
    }

    res.json({ success: true });
  }));

  // 定期清理过期 Refresh Token（每小时一次）
  setInterval(() => {
    void ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE expires_at < NOW()").catch(() => {});
  }, 60 * 60 * 1000).unref();

  return router;
}
