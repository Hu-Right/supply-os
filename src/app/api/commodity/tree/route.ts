/**
 * GET /api/commodity/tree — 品目骨架树级联选项（中类 → 小类 → 子类 → 品目）
 *
 * @description 商机页五级下拉第二~五级的取数口（10min 缓存）。
 *   `parent` 取大类码（UGT-G-xx）返回该大类所辖中类，取骨架节点码（UGT-…）返回下一级。
 *   第一级（32 个大类）不经此口：前端用 COMMODITY_GROUPS 常量 + locale 名渲染，
 *   与快筛 chip 同源同序，避免出现两份大类顺序或两种大类叫法。
 *   返回项的 key 就是骨架节点码，与公告侧 backbone_path 同口径（选中即可直接筛）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { isCommodityGroupCode } from "@/lib/services/commodity/groups";
import { normalizeBackboneNodeKey } from "@/lib/services/commodity/backbone-path";
import { isCommodityNodeKey, listCommodityTreeOptions } from "@/lib/services/commodity/tree";

export const GET = withRoute(async (req: NextRequest) => {
  const parent = normalizeBackboneNodeKey((req.nextUrl.searchParams.get("parent") || "").trim().slice(0, 40));
  if (!isCommodityGroupCode(parent) && !isCommodityNodeKey(parent)) {
    routeError(400, EC_INVALID_PARAMS, "parent 需为品目大类码（UGT-G-xx）或骨架节点码（UGT- + 2/4/6/8 位）");
  }
  const options = await listCommodityTreeOptions(getContext().dbPool, parent);
  return NextResponse.json(options, { headers: { "Cache-Control": "public, max-age=600" } });
});
