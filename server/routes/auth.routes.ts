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
import { sendPasswordResetEmail, sendRegistrationVerifyEmail, isEmailConfigured } from "../services/email";
import { sendSmsVerificationCode, isSmsConfigured } from "../services/sms";
import { validatePassword } from "../../src/shared/auth/passwordPolicy";
import { maskPhone } from "../utils/mask";

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

  // ── 注册：发送邮箱验证码 ──────────────────────────────────────────
  // 注册前必须先验证邮箱所有权，防止虚假邮箱占用
  router.post("/api/auth/send-register-code", asyncHandler(async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

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

    // 检查邮箱是否已注册
    const existing = await usersRepo.findByKey(email);
    if (existing) {
      return res.status(409).json({ error: "该邮箱已注册，请直接登录" });
    }

    // 生成 6 位验证码
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟有效

    // 写入验证码表（code_type = 'registration'）
    const [insertResult] = await ctx.dbPool.execute(
      `INSERT INTO crm_password_resets (user_key, code, code_type, expires_at, ip)
       VALUES (?, ?, 'registration', ?, ?)`,
      [email, code, expiresAt, ip],
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
      console.error(`[register-code] ✗ 注册验证码邮件发送失败: ${email} - ${errorMsg}`);
    }

    recordForgotPasswordSend(ip);

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
      return res.status(400).json({ error: "验证码已过期，请重新获取" });
    }
    if (codeRecord.attempts >= 5) {
      return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    }
    if (codeRecord.code !== verifyCode) {
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
        [codeRecord.id],
      );
      return res.status(400).json({ error: "验证码错误" });
    }

    // 检查用户是否已存在
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

    // 标记验证码已使用
    await ctx.dbPool.execute(
      "UPDATE crm_password_resets SET used = 1 WHERE id = ?",
      [codeRecord.id],
    );

    // 标记邮箱已验证（注册时已通过验证码验证邮箱所有权）
    await usersRepo.markEmailVerified(email);

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
    const channel = String(req.body.channel || "email").trim();

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

    // ── 手机验证渠道 ──
    if (channel === "sms") {
      const user = await usersRepo.findByKey(email);
      if (!user || !user.phone || !user.phone_verified) {
        return res.status(400).json({ error: "未绑定手机号，请使用邮箱验证" });
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

      // 发送短信（阿里云生成验证码并发送，返回验证码明文）
      let smsSent = false;
      let code = "";
      try {
        code = await sendSmsVerificationCode(user.phone);
        smsSent = true;
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error(`[forgot-password/sms] ✗ 短信发送失败: ${maskPhone(user.phone)} - ${errorMsg}`);
        return res.status(500).json({ error: "短信发送失败，请稍后重试" });
      }

      // 写入验证码表
      const [insertResult] = await ctx.dbPool.execute(
        `INSERT INTO crm_password_resets (user_key, phone, code, code_type, expires_at, ip)
         VALUES (?, ?, ?, 'phone_reset', ?, ?)`,
        [email, user.phone, code, expiresAt, ip],
      );
      const resetId = (insertResult as any).insertId;
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET sms_sent = 1 WHERE id = ?",
        [resetId],
      );

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
    // 检查邮件服务是否已配置
    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "邮件服务暂未配置，请联系客服重置密码" });
    }

    // 无论邮箱是否注册，都返回相同提示（防邮箱枚举攻击）
    // 但区分邮件发送状态，以便前端提示用户联系客服
    const user = await usersRepo.findByKey(email);
    let emailSent = true; // 默认 true（用户不存在时也返回 true，防枚举）
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

      recordForgotPasswordSend(ip);
    }

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
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.new_password || "");
    const channel = String(req.body.channel || "email").trim();

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "请填写完整信息" });
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    // ── 手机验证渠道 ──
    let record: any;
    if (channel === "sms") {
      // 查询该用户最新的未使用、未过期的手机验证码记录
      const [rows] = await ctx.dbPool.query(
        `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE user_key = ? AND code_type = 'phone_reset' AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      record = (rows as any[])[0];
    } else {
      // ── 邮箱验证渠道（默认） ──
      const [rows] = await ctx.dbPool.query(
        `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE user_key = ? AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      record = (rows as any[])[0];
    }

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

  // ── 手机号管理：发送验证码 ──────────────────────────────────────────
  // 手机号限流：同一号码 60 秒内仅 1 次，每小时 5 次
  const phoneSmsAttempts = new Map<string, { count: number; resetAt: number; lastSentAt: number }>();

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
  }

  // 定期清理过期条目
  setInterval(() => {
    const now = Date.now();
    for (const [phone, entry] of phoneSmsAttempts) {
      if (now > entry.resetAt) phoneSmsAttempts.delete(phone);
    }
  }, 10 * 60_000).unref();

  /** 中国大陆手机号正则（11 位数字，1 开头） */
  const PHONE_REGEX = /^1[3-9]\d{9}$/;

  router.post("/api/auth/send-phone-code", asyncHandler(async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
    const userKey = normalizeUserKey(String(req.body.user_key || "")) || "";
    const phone = String(req.body.phone || "").trim();
    const scene = String(req.body.scene || "bind");

    if (!userKey) return res.status(400).json({ error: "请先登录" });
    if (!phone || !PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: "请输入有效的手机号" });
    }
    if (!["bind", "rebind", "unbind", "reset"].includes(scene)) {
      return res.status(400).json({ error: "无效的操作类型" });
    }

    // IP 限流
    const rl = checkForgotRateLimit(ip);
    if (rl.blocked) {
      return res.status(429).json({ error: "发送过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    // 手机号限流
    const phoneRl = checkPhoneRateLimit(phone);
    if (phoneRl.blocked) {
      return res.status(429).json({ error: "验证码发送过于频繁，请稍后重试", retry_after_seconds: phoneRl.retryAfterSec });
    }

    // 短信服务检查
    if (!isSmsConfigured()) {
      return res.status(503).json({ error: "短信服务暂未配置，请稍后重试" });
    }

    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(404).json({ error: "用户不存在" });

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

    // 发送短信（阿里云生成验证码并发送，返回验证码明文）
    let code = "";
    try {
      code = await sendSmsVerificationCode(phone);
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`[send-phone-code] ✗ 短信发送失败: ${phone} - ${errorMsg}`);
      return res.status(500).json({ error: "短信发送失败，请稍后重试" });
    }

    // 写入验证码表
    const [insertResult] = await ctx.dbPool.execute(
      `INSERT INTO crm_password_resets (user_key, phone, code, code_type, expires_at, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userKey, phone, code, codeType, expiresAt, ip],
    );
    const resetId = (insertResult as any).insertId;
    await ctx.dbPool.execute(
      "UPDATE crm_password_resets SET sms_sent = 1 WHERE id = ?",
      [resetId],
    );

    recordPhoneSms(phone);
    recordForgotPasswordSend(ip);

    res.json({ success: true, sms_sent: true });
  }));

  // ── 手机号管理：绑定 ──────────────────────────────────────────
  router.post("/api/auth/bind-phone", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(String(req.body.user_key || "")) || "";
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

    if (!codeRecord) return res.status(400).json({ error: "验证码已过期，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== code) {
      await ctx.dbPool.execute("UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?", [codeRecord.id]);
      return res.status(400).json({ error: "验证码错误" });
    }

    // 检查手机号是否被其他用户绑定
    const existingByPhone = await usersRepo.findByPhone(phone);
    if (existingByPhone) return res.status(409).json({ error: "该手机号已被其他用户绑定" });

    // 绑定手机号
    await usersRepo.bindPhone(userKey, phone);

    // 标记验证码已使用
    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [codeRecord.id]);

    res.json({ success: true, phone: maskPhone(phone) });
  }));

  // ── 手机号管理：换绑 ──────────────────────────────────────────
  router.post("/api/auth/rebind-phone", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(String(req.body.user_key || "")) || "";
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

    if (!codeRecord) return res.status(400).json({ error: "验证码已过期，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== code) {
      await ctx.dbPool.execute("UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?", [codeRecord.id]);
      return res.status(400).json({ error: "验证码错误" });
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
  router.post("/api/auth/unbind-phone", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(String(req.body.user_key || "")) || "";
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

    if (!codeRecord) return res.status(400).json({ error: "验证码已过期，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== code) {
      await ctx.dbPool.execute("UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?", [codeRecord.id]);
      return res.status(400).json({ error: "验证码错误" });
    }

    // 解绑
    await usersRepo.unbindPhone(userKey);

    // 标记验证码已使用
    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [codeRecord.id]);

    res.json({ success: true });
  }));

  return router;
}
