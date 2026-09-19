/**
 * 管理端 RFQ 审核接口
 * @module app/api/admin/rfq/review/route
 * @description 打通「pending_review → published/rejected」的审核链路（P0-4）。
 *   - POST：审核单个 RFQ（approve→published / reject→rejected）
 *   - GET ：列出待审核 RFQ
 *
 * 鉴权：本仓库暂无用户角色体系，采用共享密钥 ADMIN_REVIEW_TOKEN 保护（fail-closed：
 *       未配置该环境变量时一律 403，绝不放行）。运维/内部工具通过请求头
 *       `x-admin-review-token` 携带。后续接入正式后台时替换为角色鉴权即可。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { reviewRfq, listPendingRfqs } from "@/lib/services/rfq/review";
import { EC_FORBIDDEN, EC_NOT_FOUND } from "@/shared/constants/api";

const reviewSchema = z.object({
  rfqId: z.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
});

/** 管理端鉴权（fail-closed）。校验失败抛 403。 */
function assertAdmin(req: NextRequest): void {
  const expected = process.env.ADMIN_REVIEW_TOKEN;
  const got = req.headers.get("x-admin-review-token") ?? "";
  if (!expected || !got || got !== expected) {
    routeError(403, EC_FORBIDDEN, "无审核权限");
  }
}

/** GET /api/admin/rfq/review — 待审核列表 */
export const GET = withRoute(async (req: NextRequest) => {
  assertAdmin(req);
  const list = await listPendingRfqs(getPool());
  return NextResponse.json({ code: 0, message: "ok", data: { list } });
});

/** POST /api/admin/rfq/review — 审核（approve/reject） */
export const POST = withRoute(async (req: NextRequest) => {
  assertAdmin(req);
  const body = await parseJson(req, reviewSchema);
  const ok = await reviewRfq(getPool(), body.rfqId, body.decision);
  if (!ok) routeError(404, EC_NOT_FOUND, "RFQ 不存在或不处于待审核状态");
  return NextResponse.json({ code: 0, message: "ok" });
});
