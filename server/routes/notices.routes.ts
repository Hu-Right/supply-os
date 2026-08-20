/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 公告路由编排入口
 * Notice routes orchestrator — composes search, actions & detail sub-routers
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { createNoticeSearchRouter } from "./notices/search.routes";
import { createNoticeActionsRouter } from "./notices/actions.routes";
import { createNoticeDetailRouter } from "./notices/detail.routes";
import { createNoticeReportRouter } from "./notices/report.routes";

export function createNoticesRouter(ctx: AppContext): Router {
  const router = Router();
  // N2 退役（2026-08-20）：原 industry-match 路由已删除（前端全量切换 unified-search mode=prefs）
  // 挂载顺序 = 路由优先级：静态路径先于 /:id 参数路径
  router.use(createNoticeSearchRouter(ctx));    // /api/notices/unified-search, /countries, /stats
  router.use(createNoticeActionsRouter(ctx));   // /unlocks, /feedback, /:id/view, /:id/unlock, /:id/interest
  router.use(createNoticeDetailRouter(ctx));    // /:id/detail, /:id/translation
  router.use(createNoticeReportRouter(ctx));    // /:id/report（中文版订单拆解报告下载）
  return router;
}
