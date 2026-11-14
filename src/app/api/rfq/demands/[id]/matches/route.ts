/**
 * GET /api/rfq/demands/[id]/matches — 发布即匹配候选名单（七步流程第 7 步）
 *
 * @module app/api/rfq/demands/[id]/matches/route
 * @description 仅归属人可见。候选在发布成功后由 generateMatchCandidates 规则生成
 *              （行业 L1 + 省份优先，仅平台核验供应商）；本接口只读不触发。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND } from "@/shared/constants/api";
import { listMatchCandidates } from "@/lib/services/rfq/matching";
import type { RowDataPacket } from "mysql2/promise";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT buyer_user_id FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  const row = (rows as RowDataPacket[])[0];
  if (!row) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
  if (Number(row.buyer_user_id) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权查看此需求的匹配名单");
  }

  const items = await listMatchCandidates(pool, demandId);

  /** 匹配名单视图 */
  const matchesViewOf = (list: Awaited<ReturnType<typeof listMatchCandidates>>) => ({
    items: list,
    total: list.length,
  });

  return NextResponse.json(matchesViewOf(items));
});
