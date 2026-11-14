/**
 * /api/procurement/projects/[id]/items — 标包/明细整包替换（F03）
 *
 * @module app/api/procurement/projects/[id]/items/route
 * @description PUT = 草稿/待补充态整包替换（草稿期自由增删，提交后冻结随版本快照）。
 *              请求体：{ lots: [{lotNo,title,scopeNote}], items: [{lotNo?,nameZh,...}] }。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID } from "@/shared/constants/api";
import { isProjectOwnedBy, replaceDraftItems } from "@/lib/services/procurement/projects";

interface Ctx {
  params: Promise<{ id: string }>;
}

interface ItemBody {
  lotNo?: string | null;
  nameZh?: string;
  nameEn?: string;
  spec?: string;
  quantity?: number | string;
  qtyUnit?: string;
  qtyType?: string;
  ugtCode?: string;
  attributes?: unknown;
  alternativesAllowed?: boolean;
}

export const PUT = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }
  let body: { lots?: Array<Record<string, unknown>>; items?: ItemBody[] };
  try {
    body = (await req.json()) as { lots?: Array<Record<string, unknown>>; items?: ItemBody[] };
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权操作此项目");
  }
  const lots = (body.lots ?? []).map((l) => ({
    lotNo: String(l.lotNo ?? "").trim(),
    title: String(l.title ?? "").trim(),
    scopeNote: l.scopeNote == null ? null : String(l.scopeNote),
  }));
  const items = (body.items ?? []).map((it) => ({
    lotNo: it.lotNo == null ? null : String(it.lotNo),
    nameZh: String(it.nameZh ?? "").trim(),
    nameEn: it.nameEn == null ? null : String(it.nameEn),
    spec: it.spec == null ? null : String(it.spec),
    quantity: it.quantity == null ? null : Number(it.quantity),
    qtyUnit: it.qtyUnit == null ? null : String(it.qtyUnit),
    qtyType: it.qtyType == null ? null : String(it.qtyType),
    ugtCode: it.ugtCode == null ? null : String(it.ugtCode),
    attributes: it.attributes ?? null,
    alternativesAllowed: it.alternativesAllowed !== false,
  }));
  if (items.some((it) => !it.nameZh)) routeError(400, EC_INVALID_PARAMS, "明细产品名称必填");
  if (lots.some((l) => !l.lotNo || !l.title)) routeError(400, EC_INVALID_PARAMS, "标包号与名称必填");

  try {
    const result = await replaceDraftItems(pool, { projectId, lots, items });
    if (!result.ok) {
      if (result.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
      routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或待补充状态可编辑明细");
    }
    /** 明细替换结果视图 */
    const itemsReplacedViewOf = (count: number) => ({ itemCount: count });
    return NextResponse.json(itemsReplacedViewOf(result.itemCount));
  } catch (err) {
    console.warn("[api/procurement/projects/[id]/items] replace failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "明细保存失败，请稍后重试");
  }
});
