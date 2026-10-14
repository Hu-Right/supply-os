/**
 * 商机域路由 — 列表查询
 *
 * @module app/api/opportunities/route
 * @description 子路径端点（unlocks/translation/view/unlock）已拆分到各自独立的 route.ts。
 *              GET 返回未过期商机列表（有界，最多 80 条）。
 *
 *              R3' B2（2026-10-13）：本端点原以旧品类字典的行 id（`code_id`/`industry_id`）为
 *              **必要**入参（不传则 404），过滤走那张字典表 + 商机桥表。
 *              字典退役后该过滤轴不再存在——实测 `crm_bid_opportunities` 上没有任何
 *              backbone/UGT 列，所以「换 UGT 入参」在商机表上物理不成立。取「摘掉过滤、
 *              保留有界列表」而不是删端点：它是全仓唯一的商机列表 HTTP 入口
 *              （unified-search 不返回商机），删了会连带删掉下面那条 ARCH-P0 脱敏覆盖。
 *
 *              R5'（2026-10-14）：旧品类码快照列运行期不再 SELECT ⇒ repo 不取列，
 *              本 route 也不再下发那个字段（前端已无消费方）。
 *
 *              ARCH-P0（2026-09-05）：安全修复——
 *              1. 添加认证要求（此前无认证即可拉取全量数据）
 *              2. 截断 description 至 300 字符（与公告搜索列表对齐）
 *              3. 移除 source_url（付费内容，仅在解锁后的详情端点返回）
 *              P1 越权修复：本端点曾无认证返回完整 description + source_url，
 *              可绕过统一搜索的付费脱敏口径（core_locked 截断）。现已要求登录，
 *              且 description 截断至 300 字、source_url 置空，与列表口径对齐。
 *              未解锁详情仍需走 /api/opportunities/[id]/unlock 链路。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { EC_AUTH_REQUIRED } from "@/shared/constants/api";

/** description 截断阈值（与公告搜索列表 300 字符对齐） */
const LIST_DESC_MAX_CHARS = 300;

// ── GET /api/opportunities — 商机列表（需认证，脱敏口径，有界 80 条）──
export const GET = withRoute(
  async (req: NextRequest) => {
    const auth = await requireUserKeyOrThrow(req);
    if (!auth.userId) {
      return NextResponse.json({ code: EC_AUTH_REQUIRED, message: "请先登录" }, { status: 401 });
    }

    const ctx = getContext();
    const items = await ctx.opportunitiesRepo.listOpportunities();
    return NextResponse.json(
      items.map((row) => ({
        ...row,
        // ARCH-P0：截断全文 + 移除外部链接，付费内容仅在解锁后详情端点返回
        description: row.description && row.description.length > LIST_DESC_MAX_CHARS
          ? row.description.slice(0, LIST_DESC_MAX_CHARS) + "…"
          : row.description,
        source_url: undefined,
      })),
    );
  },
);
