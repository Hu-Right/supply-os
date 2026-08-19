/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import type { Express } from "express";
import type { AppContext } from "./context";
// P1 性能优化：ESM 兼容压缩中间件导入（替代原 CJS require 模式）
// 回滚：删除此行，恢复原 try { require("compression") } 块
import compression from "compression";
import { createLeadsRouter } from "./routes/leads.routes";
import { createSuppliersRouter } from "./routes/suppliers.routes";
import { createAuthRouter } from "./routes/auth.routes";
import { createPaymentRouter } from "./routes/payment.routes";
import { createCatalogRouter } from "./routes/catalog.routes";
import { createOpportunitiesRouter } from "./routes/opportunities.routes";
import { createNoticesRouter } from "./routes/notices.routes";
import { createUserPrefsRouter } from "./routes/user-prefs.routes";
import { createMembershipRouter } from "./routes/membership.routes";
import { createAdminRouter } from "./routes/admin.routes";
import { createTrainingRouter } from "./routes/training.routes";
import { createAiRouter } from "./routes/ai.routes";
import { createSystemRouter } from "./routes/system.routes";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { optionalAuth } from "./middleware/auth";
import { csrfProtection } from "./middleware/csrf";

export function createApp(ctx: AppContext): Express {
  const app = express();
  // P1-3 安全加固：信任反向代理，正确解析 X-Forwarded-For
  // 部署约束：必须确保 Nginx/CDN 覆盖（而非追加）X-Forwarded-For 头，
  // 否则攻击者可伪造 XFF 最左值绕过 IP 限流。Express trust proxy=1 取 XFF 最左值，
  // 只有当反向代理覆盖 XFF 时才能保证安全。
  app.set("trust proxy", 1);
  // ── Brotli/Gzip 压缩（ESM 兼容：直接 import，构建时 --packages=external 保留运行时依赖）──
  // P1 性能优化：Brotli 压缩替代默认 gzip——比 gzip 再减 15-25% 传输体积
  // compression 中间件自动协商：客户端 Accept-Encoding 含 br 则用 Brotli，否则回退 gzip
  // 回滚：恢复为 app.use(compression()) 无参数调用
  app.use(compression({
    // Brotli 压缩级别 4：平衡压缩率与 CPU 开销（1=最快，11=最高压缩率）
    level: 4,
    // 仅压缩超过 1KB 的响应，小响应压缩开销反而增大体积
    threshold: 1024,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // 支付宝异步通知为 form-urlencoded
  // 全局中间件：仅从 JWT 提取身份（legacy user_key 回退已于 2026-08-19 退役）
  app.use(optionalAuth);
  // P0-3 安全加固：CSRF 防护（纵深防御，JWT Bearer 请求自动跳过）
  app.use(csrfProtection);
  // 挂载顺序 = 原 server.ts 注册顺序，禁止调整：
  app.use(createLeadsRouter(ctx));            // 1. /api/leads*
  app.use(createSuppliersRouter(ctx));        // 2. /api/suppliers*, /api/supplier-claims
  app.use(createAuthRouter(ctx));             // 3. /api/auth/*
  app.use(createPaymentRouter(ctx));          // 4. /api/billing/*, /api/payment*, /api/payments*
  app.use(createCatalogRouter(ctx));           // 5. /api/certifications, /api/unspsc/*
  app.use(createOpportunitiesRouter(ctx));    // 6. /api/opportunities*
  app.use(createNoticesRouter(ctx));          // 7. /api/notices*（静态路径先于 /:id）
  app.use(createUserPrefsRouter(ctx));         // 8. /api/user/industry-prefs
  app.use(createMembershipRouter(ctx));        // 9. /api/membership/*
  app.use(createAdminRouter(ctx));             // 10. /api/admin/*, /api/procurement/schema-status
  app.use(createTrainingRouter(ctx));          // 11. /api/training/*
  app.use(createAiRouter(ctx));               // 12. /api/ai/matchmake
  app.use(createSystemRouter(ctx));            // 13. /api/system/*

  // ── 全局兜底（必须在所有路由之后）──
  app.use(notFoundHandler);                    // 13. 404
  app.use(errorHandler);                       // 14. 统一错误处理
  return app;
}
