/**
 * GET /api/membership/credits — 当前用户可用的「年包抵扣」服务单（需认证）。
 *
 * @description 承载 260928 报价表「199 升级年包可全额抵扣」的展示口径：目录行
 *              credit_to_annual_plan=1 且已成交、尚未被任何 pending/paid 套餐订单引用的服务单。
 *              只读一张单；实际核销在支付服务端下单时再次计算（本接口只用于前端把年付卡的
 *              展示价与真实应付对齐，不是定价依据）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import type { AnnualPlanCredit } from "@/types/membership";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const credit = await getContext().payment.paymentsRepo.findUsableAnnualPlanCredit(auth.userId);
  const body: AnnualPlanCredit | null = credit
    ? { source_order_no: credit.order_no, amount: Number(credit.amount), currency: credit.currency }
    : null;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
});
