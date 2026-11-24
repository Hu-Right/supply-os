/**
 * GET /api/suppliers/[id] — 单条供应商详情（公开）
 *
 * @module app/api/suppliers/[id]/route
 * @description 按 ID 查询单条供应商，返回 Supplier DTO（含联系方式脱敏）。
 *              找不到返回 404，参数无效返回 400。
 *              公开面口径 = `info_review_status='reviewed'`（与列表一致；旧注释误写
 *              verify_status='done'，认证只代表执照认领通过，不是门户可见门槛）。
 *              防重兜底：当查到的记录关键字段（products/industry）为空时，
 *              自动按公司名查找数据更完整的同公司记录（应对外部同步产生空字段重复记录）。
 *              本人绑定主体（users.supplier_id）即使 verify_status=pending 也允许查看自己的档案：
 *              资质评审/认领中的企业详情不该对所有者 404。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { getPool } from "@/lib/db/pool";
import { supplierViewOf } from "@/lib/services/suppliers";
import { SupplierDiagnosisRepo } from "@/lib/repos/supplier-diagnosis.repo";
import { supplierScorecardViewOf } from "@/lib/services/supplier-diagnosis/scorecard-view";
import { loadCountryAliasSnapshot } from "@/lib/services/country/alias-store";
import { loadSupplierIndustryInfo } from "@/lib/services/industry-labels";
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

    // 2026-11-24 并行化：认领状态 / 行业标签 / 国家快照 / 成绩单四件事互不依赖，
    // 一次 Promise.all 发完。此前串行 await，高延迟链路上白等 4 个完整往返。
    // 每个分支独立降级：查认领失败按未认领、标签/快照/成绩单失败按缺席处理，不阻断主流程。
    const lang = new URL(req.url).searchParams.get("lang") ?? "zh";
    const [claimed, industryInfo, snap, scorecard] = await Promise.all([
      ctx.supplier.directoryRepo.isClaimed(numericId).catch((err) => {
        console.error("[suppliers/:id GET] 认领状态查询失败:", err);
        return false;
      }),
      loadSupplierIndustryInfo(ctx.supplier.industryRepo, [row]).catch((err) => {
        console.error("[suppliers/:id GET] 行业面标签装配失败，本次退回自填文本:", err);
        return null;
      }),
      loadCountryAliasSnapshot(ctx.dbPool).catch((err) => {
        console.error("[suppliers/:id GET] 国家展示快照加载失败，本次退回原文:", err);
        return undefined;
      }),
      (async () => {
        try {
          const scoreRow = await new SupplierDiagnosisRepo(getPool()).findClaimantScorecard(numericId);
          return scoreRow ? supplierScorecardViewOf(scoreRow, lang) : null;
        } catch (err) {
          console.error("[suppliers/:id GET] 成绩单装配失败，本次不渲染:", err);
          return null;
        }
      })(),
    ]);
    const industry = industryInfo?.get(Number(row.id)) ?? null;

    return NextResponse.json({ ...supplierViewOf(row, industry, snap), claimed, scorecard });
  } catch (err) {
    // 路由自身抛出的 400/404 必须原样返回；只有未预期异常才是 500
    if (err instanceof RouteError) throw err;
    console.error("[suppliers/:id GET]", err);
    routeError(500, EC_INTERNAL_ERROR, "查询供应商失败");
  }
});
