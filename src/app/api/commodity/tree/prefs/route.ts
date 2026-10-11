/**
 * GET /api/commodity/tree/prefs — 把账号行业偏好（旧字典 id）换算成品目树路径
 *
 * @description 商机页「品目匹配」模式下，五级下拉需要按账号偏好预选一条路径、提示条需要它的名称。
 *   偏好表存的是旧字典 `crm_unspsc_codes` 的行 id，其 level=1 是 10 个字母容器（A..J），
 *   在新分类里没有对应层 ⇒ 换算只认 level>=2（段/族/类/品目），大类由段前缀反查常量得到。
 *   见 lib/services/commodity/tree.ts 的 resolveUnspscIdsToCommodityPath。
 *
 *   本接口只做「身份 id → 公共分类信息」的翻译，不返回用户数据，故不需登录态。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { resolveUnspscIdsToCommodityPath } from "@/lib/services/commodity/tree";

export const GET = withRoute(async (req: NextRequest) => {
  const ids = (req.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .slice(0, 5)
    .map((s) => Number(s.trim()) || 0);
  const resolved = await resolveUnspscIdsToCommodityPath(getContext().dbPool, ids);
  return NextResponse.json(resolved, { headers: { "Cache-Control": "public, max-age=600" } });
});
