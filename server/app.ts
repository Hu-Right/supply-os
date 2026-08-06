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
import { extractUserKey } from "./middleware/auth";

export function createApp(ctx: AppContext): Express {
  const app = express();
  // ── Gzip 压缩（ESM 兼容：直接 import，构建时 --packages=external 保留运行时依赖）──
  // P1 性能优化：修复原 CJS require 在 ESM 模式下不生效的问题
  // 回滚：恢复为 try { if (typeof require !== 'undefined') app.use(require('compression')()) } catch {}
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // 支付宝异步通知为 form-urlencoded
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
