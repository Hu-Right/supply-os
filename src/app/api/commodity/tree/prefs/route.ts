/**
 * GET /api/commodity/tree/prefs — 把账号行业偏好（UGT 最深节点码）换算成品目骨架节点路径
 *
 * @description 商机页「品目匹配」模式：偏好提示条需要路径名称、第一级需要大类码。
 *   偏好表直接存 `commodity_code`（最深已选 UGT 节点码），祖先链由码长纯切片得出
 *   （BB1 不变量），各级名称一条 `code IN` 点查补齐。旧版「字典行 id → 节点」的换算
 *   随 旧品类字典退役整体删除，本接口只认 `?code=`。
 *   见 lib/services/commodity/tree.ts 的 resolveCommodityCodeToPath。
 *
 *   本接口只做「码 → 公共分类信息」的翻译，不返回用户数据，故不需登录态。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { resolveCommodityCodeToPath } from "@/lib/services/commodity/tree";

export const GET = withRoute(async (req: NextRequest) => {
  const code = (req.nextUrl.searchParams.get("code") || "").trim().slice(0, 24);
  const resolved = await resolveCommodityCodeToPath(getContext().dbPool, code || null);
  return NextResponse.json(resolved, { headers: { "Cache-Control": "public, max-age=600" } });
});
