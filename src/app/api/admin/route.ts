/**
 * /api/admin 基路径 — 已拆分为独立子路由
 *
 * @module app/api/admin/route
 * @description 所有子端点已迁移至独立 route.ts 文件：
 *   - GET /api/admin/quality/snapshot
 *   - GET /api/admin/metrics/amount-backfill
 *   - GET /api/admin/metrics/view-rollup
 *   - GET /api/admin/metrics/reco-ab
 *   - GET /api/admin/data-ops/tables
 *   - GET /api/admin/translation/queue
 *   - GET /api/admin/users
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { code: 410, message: "Use specific sub-path: /admin/quality/snapshot, /admin/metrics/*, /admin/data-ops/tables, /admin/translation/queue, /admin/users" },
    { status: 410 },
  );
}
