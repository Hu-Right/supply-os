/**
 * GET /api/notices/home-columns — 首页三栏的公告列（热门商机 / 最新 RFQ）
 *
 * @module app/api/notices/home-columns/route
 * @description 2026-11-18 起首页这两栏直接从服务表 notice_public 取数，**不再经
 *              unified-search（Meili/MySQL 检索）**：
 *              1) 口径与数字墙统一（服务表机会池）；
 *              2) 首页曝光不再写 user_search_log（旧链路把 featured/notice_type 当检索条件，
 *                 每次首页加载都会产生两条“假检索”，污染真实热门搜索统计）；
 *              3) 不依赖 Meili 健康度，链路少一跳。
 *              卡片字段与搜索列表同一出口（fetchDetailsByIds → formatItems → toNoticeListView）。
 *
 *              响应：裸载荷 { items: NoticeItem[] }（与 unified-search 的 items 同契约）。
 *              缓存：公开聚合，HTTP 5 分钟（服务端数据源本身有 30 分钟重建/5s 级宽表同步节奏）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getHomeNoticeColumn, type HomeNoticeColumnKind } from "@/lib/services/notice-public/home-columns";
import { toNoticeListView } from "@/lib/services/notice-public/view";
import { maskTranslationFieldList } from "@/lib/services/notice-public/translation-access";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

const KINDS: readonly HomeNoticeColumnKind[] = ["opportunity", "rfq"];

export const GET = withRoute(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "";
  if (!(KINDS as readonly string[]).includes(type)) {
    routeError(400, EC_INVALID_PARAMS, "type 必须是 opportunity 或 rfq");
  }
  const limit = Number(sp.get("limit")) || 20;
  const rows = await getHomeNoticeColumn(getPool(), type as HomeNoticeColumnKind, limit);
  // 公开面（`Cache-Control: public` 且按 URL 共享缓存，无法按账号个性化）：
  // 一律只给原文，不参与译文权益判定（2026-11-24 口径 A+3 的公开面例外）。
  const items = maskTranslationFieldList(toNoticeListView(rows));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=300" } });
});
