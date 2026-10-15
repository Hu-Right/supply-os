/**
 * GET /api/commodity/tree — 品目骨架树级联选项（大类 → 中类 → … → 品目）
 *
 * @description 商机页五级下拉的取数口（10min 缓存）。
 *   `parent` 为空返回 32 个 L1 大类行（key=UGT-xx，前端第一级下拉直接渲染树名）；
 *   取骨架节点码（UGT-…）返回下一级。
 *   2026-10-15 G 码退役：第一级不再是前端常量，与后续各级同源同树——
 *   树怎么调，第一级就跟着怎么变。
 *   返回项的 key 就是骨架节点码，与公告侧 backbone_path 同口径（选中即可直接筛）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { normalizeBackboneNodeKey } from "@/lib/services/commodity/backbone-path";
import { isCommodityNodeKey, listCommodityTreeOptions } from "@/lib/services/commodity/tree";

export const GET = withRoute(async (req: NextRequest) => {
  const raw = (req.nextUrl.searchParams.get("parent") || "").trim().slice(0, 40);
  const parent = normalizeBackboneNodeKey(raw);
  if (raw && !isCommodityNodeKey(parent)) {
    routeError(400, EC_INVALID_PARAMS, "parent 需为空（返回大类层）或骨架节点码（UGT- + 2/4/6/8/10 位）");
  }
  const options = await listCommodityTreeOptions(getContext().dbPool, parent);
  return NextResponse.json(options, { headers: { "Cache-Control": "public, max-age=600" } });
});
