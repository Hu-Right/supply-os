/**
 * GET /api/commodity/tree/prefs — 把账号行业偏好（旧字典 id）换算成品目骨架节点路径
 *
 * @description 商机页「品目匹配」模式下，五级下拉需要按账号偏好预选一条路径、提示条需要它的名称。
 *   偏好表存的是旧字典 `crm_unspsc_codes` 的行 id，其 level=1 是 10 个字母容器（A..J），
 *   在新分类里没有对应层 ⇒ 换算只认 level>=2，四条映射全走新树自己的数据：
 *   段→大类 L1（经 group_segments）、族→中类 L2（由类行往上推，BB3 保证唯一）、
 *   类→子类 L4、品目→L5（unspsc_prefix 等值）；大类码取自 L1 行的 group_code（不再反查常量）。
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
