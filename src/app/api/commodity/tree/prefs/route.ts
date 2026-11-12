/**
 * GET /api/commodity/tree/prefs — UGT 节点码 → 祖先路径（各级名称 + 所属大类 L1 码）
 *
 * @description 纯「码 → 公共分类信息」翻译：祖先链由码长纯切片得出（BB1 不变量），
 *   各级名称一条 `code IN` 点查补齐。旧版「字典行 id → 节点」的换算随旧品类字典退役删除，
 *   本接口只认 `?code=`。
 *
 *   路径名沿用 `/prefs` 是历史命名（原为商机页「品目匹配」模式服务，该模式已于
 *   2026-11-12 随「主营行业」下线）。接口本身与用户数据无关、无登录态要求，
 *   仍可作为「任意节点码 → 面包屑」的公共读取口复用；改名会破坏已分发链接，故保留。
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
