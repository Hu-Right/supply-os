/**
 * 认证路由 — 组合器（向后兼容入口）
 * Auth Router — Composer (backward-compatible entry)
 *
 * @module server/routes/auth.routes
 * @description 速率限制器实例 + 4 个子路由组合。
 *              对外 API 不变：app.ts 仍然 import { createAuthRouter } from "./routes/auth.routes"。
 *
 * 拆分后的文件结构：
 *   routes/auth/
 *   ├── register.routes.ts  ← 发送注册验证码 + 注册
 *   ├── login.routes.ts     ← 登录 + 用户信息 + Token 刷新 + 登出
 *   ├── password.routes.ts  ← 检查邮箱手机 + 找回密码 + 重置密码
 *   └── phone.routes.ts     ← 发送手机验证码 + 绑定 + 换绑 + 解绑
 */
import path from "path";
import { Router } from "express";
import type { AppContext } from "../context";
import { createRateLimiter } from "../middleware/rateLimiter";
import { createRegisterRouter } from "./auth/register.routes";
import { createLoginRouter } from "./auth/login.routes";
import { createPasswordRouter } from "./auth/password.routes";
import { createPhoneRouter } from "./auth/phone.routes";

// ── 速率限制器实例（统一由 rateLimiter 工厂创建，内存 + 文件持久化）──
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  persistFile: path.resolve(process.cwd(), "server/logs/.login-rate-limit.json"),
  cleanupIntervalMs: 5 * 60 * 1000,
});

const accountRateLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  maxAttempts: 5,
  persistFile: path.resolve(process.cwd(), "server/logs/.account-rate-limit.json"),
  cleanupIntervalMs: 10 * 60 * 1000,
});

const forgotRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  persistFile: path.resolve(process.cwd(), "server/logs/.forgot-rate-limit.json"),
  cleanupIntervalMs: 10 * 60 * 1000,
});

const phoneSmsRateLimiter = createRateLimiter({
  windowMs: 3600_000,
  maxAttempts: 5,
  persistFile: path.resolve(process.cwd(), "server/logs/.phone-rate-limit.json"),
  cleanupIntervalMs: 10 * 60_000,
  supportLastSentAt: true,
  minIntervalMs: 60_000,
});

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();

  // 组合 4 个子路由
  router.use(createRegisterRouter(ctx, forgotRateLimiter));
  router.use(createLoginRouter(ctx, loginRateLimiter, accountRateLimiter));
  router.use(createPasswordRouter(ctx, forgotRateLimiter, phoneSmsRateLimiter));
  router.use(createPhoneRouter(ctx, forgotRateLimiter, phoneSmsRateLimiter));

  // 定期清理过期 Refresh Token（每小时一次；#6：SQL 下沉 AuthRepo）
  setInterval(() => {
    void ctx.user.authRepo.deleteExpiredRefreshTokens().catch(() => {});
  }, 60 * 60 * 1000).unref();

  return router;
}
