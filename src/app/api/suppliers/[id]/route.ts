/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO（含联系方式脱敏）。
 *              找不到返回 404，参数无效返回 400。
 *              防重兜底：当查到的记录关键字段（products/industry）为空时，
 *              自动按公司名查找数据更完整的同公司记录（应对外部同步产生空字段重复记录）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { mapSupplierRow } from "@/lib/services/suppliers";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
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

    return NextResponse.json({ ...mapSupplierRow(row), claimed });
  } catch (err) {
    console.error("[suppliers/:id GET]", err);
    routeError(500, EC_INTERNAL_ERROR, "查询供应商失败");
  }
});
