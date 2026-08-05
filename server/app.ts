/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import compression from "compression";
import type { Express } from "express";
import type { AppContext } from "./context";
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
import { extractUserKey } from "./middleware/auth";

export function createApp(ctx: AppContext): Express {
  const app = express();
  // ── Gzip 压缩：所有响应自动压缩，首屏 JS 从 ~700KB 降至 ~215KB ──
  app.use(compression());
  app.use(express.json());
  // 全局中间件：提取 user_key 挂到 req.userKey（所有路由可用）
  app.use(extractUserKey);
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
