/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO（含联系方式脱敏）。
 *              找不到返回 404，参数无效返回 400。
 *              防重兜底：当查到的记录关键字段（products/industry）为空时，
 *              自动按公司名查找数据更完整的同公司记录（应对外部同步产生空字段重复记录）。
 *              本人绑定主体（users.supplier_id）即使 verify_status=pending 也允许查看自己的档案：
 *              资质评审/认领中的企业详情不该对所有者 404。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { supplierViewOf } from "@/lib/services/suppliers";
import { loadCountryAliasSnapshot, type CountryAliasSnapshot } from "@/lib/services/country/alias-store";
import { loadSupplierIndustryInfo } from "@/lib/services/industry-labels";
import type { SupplierIndustryInfo } from "@/lib/services/industry-labels";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { extractUserKey } from "@/lib/middleware/auth";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_INTERNAL_ERROR } from "@/shared/constants/api";
import { parseSupplierId } from "@/lib/utils/supplier-id";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const numericId = parseSupplierId(id);

    if (!numericId) {
      routeError(400, EC_INVALID_PARAMS, `无效的供应商 ID: ${id}`);
    }

    const ctx = getContext();
    let row = await ctx.supplier.directoryRepo.findByIdWithFallback(numericId);

    // 公开面只认 verify_status='done'；本人绑定主体（认领/资质评审中）允许查看自己的档案
    if (!row) {
      const auth = await extractUserKey(req);
      if (auth.userId) {
        const me = await ctx.user.usersRepo.findProfileById(auth.userId);
        if (Number(me?.supplier_id ?? 0) === numericId) {
          row = await ctx.supplier.directoryRepo.findByIdAnyStatus(numericId);
        }
      }
    }

    if (!row) {
      routeError(404, EC_NOT_FOUND, `供应商不存在: ${numericId}`);
    }

    // 检查该供应商是否已被认领（永久绑定或临时绑定中）
    let claimed = false;
    try {
      claimed = await ctx.supplier.directoryRepo.isClaimed(numericId);
    } catch {
      // 查询失败不影响主流程
    }

    // 行业面标签：装配失败只退回自填文本（与列表口径一致），不把详情页打成 500
    let industry: SupplierIndustryInfo | null = null;
    try {
      const info = await loadSupplierIndustryInfo(ctx.supplier.industryRepo, [row]);
      industry = info.get(Number(row.id)) ?? null;
    } catch (err) {
      console.error("[suppliers/:id GET] 行业面标签装配失败，本次退回自填文本:", err);
    }

    let snap: CountryAliasSnapshot | undefined;
    try {
      snap = await loadCountryAliasSnapshot(ctx.dbPool);
    } catch (err) {
      console.error("[suppliers/:id GET] 国家展示快照加载失败，本次退回原文:", err);
    }

    return NextResponse.json({ ...supplierViewOf(row, industry, snap), claimed });
  } catch (err) {
    // 路由自身抛出的 400/404 必须原样返回；只有未预期异常才是 500
    if (err instanceof RouteError) throw err;
    console.error("[suppliers/:id GET]", err);
    routeError(500, EC_INTERNAL_ERROR, "查询供应商失败");
  }
});
