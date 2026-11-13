/**
 * POST /api/rfq/demands — 创建采购需求（草稿）
 *
 * @module app/api/rfq/demands/route
 * @description v2 入口：写入 `rfq_demand`（不再写爬虫主表）。请求体同时兼容旧字段名
 *              （`budget` 万元 / `deadline` 日期串），归一化集中在 `lib/services/rfq/payload`。
 *              返回裸载荷（与 ARCHITECTURE 的成功响应口径一致）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR } from "@/shared/constants/api";
import { createDemandDraft } from "@/lib/services/rfq/create";
import { normalizeCreatePayload } from "@/lib/services/rfq/payload";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const rl = checkRateLimit(
    req,
    { windowMs: 10 * 60_000, maxAttempts: 10 },
    () => `rfq-demand-create:${auth.userId}`,
  );
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const patch = normalizeCreatePayload(body);
  if (!patch.title) routeError(400, EC_INVALID_PARAMS, "缺少需求标题");

  try {
    const created = await createDemandDraft(getPool(), {
      buyerUserId: auth.userId,
      buyerOrgName: String(body.buyerOrgName ?? body.buyer_org_name ?? "") || null,
      title: patch.title,
      description: patch.description,
      categoryCode: patch.categoryCode,
      provinceCode: patch.provinceCode,
      provinceName: patch.provinceName,
      purchaseType: patch.purchaseType,
      quantity: patch.quantity,
      quantityUnit: patch.quantityUnit,
      budgetAmount: patch.budgetAmount,
      budgetCurrency: patch.budgetCurrency,
      budgetConfidential: patch.budgetConfidential,
      incoterm: patch.incoterm,
      deliveryTime: patch.deliveryTime,
      deliveryAddress: patch.deliveryAddress,
      paymentTerms: patch.paymentTerms,
      supplierReqs: patch.supplierReqs,
      visibility: patch.visibility,
      contactName: patch.contactName,
      contactEmail: patch.contactEmail,
      contactPhone: patch.contactPhone,
      termsVersion: patch.termsVersion,
      agreedAt: patch.agreedAt,
      closeAt: patch.closeAt,
    });

    if (!created.ok) routeError(400, EC_INVALID_PARAMS, "标题不能为空");

    return NextResponse.json(
      { id: created.id, reference: created.reference, status: "draft" },
      { status: 201 },
    );
  } catch (err) {
    console.warn("[api/rfq/demands] create failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "创建失败，请稍后重试");
  }
});
