/**
 * GET /api/commodity/tree/resolve — 骨架节点码 → 所属大类码
 *
 * @description 为什么需要这个接口：外链只带 `?commodity=UGT-010101` 时，五级下拉的第一级
 *   （32 个大类）要点亮，就得知道这个节点属于哪个大类。
 *   不能由码自身切片得到 —— 2026-10-11 实测 32 个 L1 行里只有 5 行的码序号等于大类码序号
 *   （`UGT-01` 的 `group_code` 是 `UGT-G-11`），所以必须按 `code` 点查一次（走 `uk_code`）。
 *   只在深链落地且 URL 没带 group 时被调用一次，命中 10min 缓存。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { normalizeBackboneNodeKey } from "@/lib/services/commodity/backbone-path";
import { isCommodityNodeKey, resolveGroupCodeOfNode } from "@/lib/services/commodity/tree";

export const GET = withRoute(async (req: NextRequest) => {
  const code = normalizeBackboneNodeKey((req.nextUrl.searchParams.get("code") || "").trim().slice(0, 40));
  if (!isCommodityNodeKey(code)) {
    routeError(400, EC_INVALID_PARAMS, "code 需为骨架节点码（UGT- + 2/4/6/8/10 位数字）");
  }
  const groupCode = await resolveGroupCodeOfNode(getContext().dbPool, code);
  return NextResponse.json({ groupCode }, { headers: { "Cache-Control": "public, max-age=600" } });
});
