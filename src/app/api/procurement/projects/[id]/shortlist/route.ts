/**
 * /api/procurement/projects/[id]/shortlist — EOI 短名单（GET / POST）
 *
 * @module app/api/procurement/projects/[id]/shortlist/route
 * @description POST = 采购方批量定入围（EOI 专属；意向截止收口后执行；理由 ≥10 字）；
 *              GET = 短名单（结案后公开最小集；未结案仅归属人/参与供应商可见口径随详情页裁剪）。
 *              《全案》F12 定式：EOI 最终结果是供应商名单，不是确认中标。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_NOT_OPENED,
  EC_RFQ_RESPONSE_NOT_FOUND,
  EC_RFQ_SHORTLIST_FINALIZED,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { finalizeShortlist, getPublicShortlist, getShortlist } from "@/lib/services/procurement/awards";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseProjectId(raw: string): number {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  return id;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);
  const pool = getPool();

  // 结案后公开；未结案仅归属人可见
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    const publicRows = await getPublicShortlist(pool, projectId);
    if (publicRows == null) routeError(404, EC_RFQ_NOT_FOUND, "短名单尚未公示");
    return NextResponse.json(shortlistResponseViewOf(publicRows));
  }
  return NextResponse.json(shortlistResponseViewOf(await getShortlist(pool, projectId)));
});

/** 短名单响应视图 */
function shortlistResponseViewOf(rows: Awaited<ReturnType<typeof getShortlist>>) {
  return { shortlist: rows };
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }
  const responseIds = Array.isArray(body.responseIds) ? (body.responseIds as unknown[]).map((n) => Number(n)) : [];
  const reason = String(body.reason ?? "").trim();
  if (responseIds.length === 0) routeError(400, EC_INVALID_PARAMS, "请选择入围响应");
  if (reason.length < 10) routeError(400, EC_INVALID_PARAMS, "入围理由需不少于 10 个字");

  const result = await finalizeShortlist(getPool(), {
    projectId,
    buyerUserId: auth.userId,
    responseIds,
    reason,
  });
  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权为该需求定短名单");
        break;
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "采购需求或响应不存在");
        break;
      case "not_opened":
        routeError(409, EC_RFQ_NOT_OPENED, "意向征集尚未截止收口，不能定短名单");
        break;
      case "shortlist_exists":
        routeError(409, EC_RFQ_SHORTLIST_FINALIZED, "该意向征集已形成短名单");
        break;
      case "response_invalid":
        routeError(400, EC_RFQ_RESPONSE_NOT_FOUND, "所选响应不存在或不在可入围状态");
        break;
      case "reason_required":
        routeError(400, EC_INVALID_PARAMS, "入围理由需不少于 10 个字");
        break;
      case "empty_selection":
        routeError(400, EC_INVALID_PARAMS, "请选择入围响应");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许形成短名单");
    }
  }

  /** 短名单视图 */
  const shortlistViewOf = (r: Extract<typeof result, { ok: true }>) => ({
    awardIds: r.awardIds,
    supplierIds: r.supplierIds,
  });
  return NextResponse.json(shortlistViewOf(result));
});
