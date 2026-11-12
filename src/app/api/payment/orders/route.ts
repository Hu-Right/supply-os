/**
 * GET  /api/payment/orders — 订单历史（聚合四表 + 内存归并分页）
 * POST /api/payment/orders — 创建支付订单（旧入口：按 plan_code 前缀分派）
 *
 * @module app/api/payment/orders/route
 * @description POST 自 2026-11-12 起只是**适配器**：解析 legacy body（`plan_code`）后转调
 *              `lib/payment/orders/create-order`，与 `/api/orders` 共用同一份下单实现，
 *              两个入口不可能出现行为漂移。新接入请用 `/api/orders`
 *              （`product_kind` + `product_code` 显式契约）。
 *              本路由保留的原因是存量前端 `core/payment/api.ts` 仍按 `plan_code` 下单，
 *              等前端切完再议下线。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";
import { createOrder, mapOrderError, orderViewOf } from "@/lib/payment/orders/create-order";

// ── GET — 订单历史（聚合三表） ──
export const GET = withRoute(
  async (req: NextRequest) => {
    const auth = await requireUserKeyOrThrow(req);

    const url = req.nextUrl;
    const ctx = getContext();
    const { orchestrator } = ctx.payment;

    const status = url.searchParams.get("status") || "all";
    const limit = clampLimit(url.searchParams.get("limit"), DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const offset = (page - 1) * limit;

    const { total, list } = await orchestrator.listAllOrders(auth.userId, status, limit, offset);
    return NextResponse.json({ total, page, limit, list });
  },
);

// ── POST — 创建支付订单 ──
export const POST = withRoute(
  async (req: NextRequest) => {
    const auth = await requireUserKeyOrThrow(req);

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "";

    let outcome;
    try {
      const body = (await req.json()) as Record<string, unknown>;
      outcome = await createOrder(auth.userId, body, clientIp);
    } catch (err: unknown) {
      // 仅兜住 req.json() 解析失败：createOrder 内部自捕获业务错，不会外抛
      const raw = String((err as Error)?.message || "");
      console.error("[payment/orders] 读取下单请求失败:", raw, (err as Error)?.stack);
      outcome = mapOrderError(raw);
    }

    if (!outcome.ok) routeError(outcome.status, outcome.code, outcome.message);
    return NextResponse.json(await orderViewOf(outcome.result, outcome.paymentMode), { status: 201 });
  },
);
