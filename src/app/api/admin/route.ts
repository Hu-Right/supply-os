/**
 * Admin 域 Route Handlers
 *
 * GET /api/admin/quality/snapshot — 质量快照
 * GET /api/admin/metrics/amount-backfill — 金额回填进度
 * GET /api/admin/metrics/view-rollup — 视图汇总统计
 * GET /api/admin/metrics/reco-ab — 推荐 AB 测试指标
 * GET /api/admin/data-ops/tables — 数据库表信息
 * GET /api/admin/translation/queue — 翻译队列状态
 * GET /api/admin/users — 用户列表
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const path = url.pathname;
  const ctx = getContext();
  const adminRepo = ctx.admin.adminRepo;

  if (path.endsWith("/quality/snapshot")) {
    const days = Number(req.nextUrl.searchParams.get("days")) || 30;
    const snapshots = await adminRepo.listQualitySnapshots(days);
    return NextResponse.json(snapshots);
  }

  if (path.endsWith("/metrics/amount-backfill")) {
    const parseVersion = Number(req.nextUrl.searchParams.get("parse_version")) || 2;
    const remaining = await adminRepo.countAmountBackfillRemaining(parseVersion);
    return NextResponse.json({ remaining, parse_version: parseVersion });
  }

  if (path.endsWith("/metrics/view-rollup")) {
    const stats = await adminRepo.getViewRollupStats();
    return NextResponse.json(stats);
  }

  if (path.endsWith("/metrics/reco-ab")) {
    const sinceDays = Number(req.nextUrl.searchParams.get("since_days")) || 30;
    const metrics = await adminRepo.listRecoAbMetrics(sinceDays);
    return NextResponse.json(metrics);
  }

  if (path.endsWith("/data-ops/tables")) {
    const tables = await adminRepo.listExistingTables(["crm_bid_notices", "supplier", "users"]);
    const tableList = Array.from(tables) as string[];
    const rowCounts: Record<string, number> = {};
    for (const t of tableList) {
      rowCounts[t] = await adminRepo.countTableRows(t);
    }
    return NextResponse.json({ tables: tableList, row_counts: rowCounts });
  }

  if (path.endsWith("/translation/queue")) {
    return NextResponse.json({ pending: 0, processing: 0 });
  }

  if (path.endsWith("/users")) {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
    const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
    return NextResponse.json({ users: [], limit, offset });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
