/**
 * 支付域路由（Orders / Alipay Redirect / Config-Status / Mock-Paid）
 * Payment domain routes
 *
 * @module app/api/payment/route
 * @description 从 Express routes/payment.routes.ts 迁移。
 *              涵盖：创建订单、查询订单、支付宝跳转、配置状态、Mock 履约。
 *              通知端点（alipay/wechat notify）已独立至 notify/route.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, requireAdmin } from "@/lib/middleware/auth";
import { getPaymentRuntimeConfig } from "@/server/config/env";
import { toQrDataUrl } from "@/server/payment/qr";
import { fulfillMockPayment } from "@/server/payment/fulfillment";

// ── 错误码定义（与 server/utils/http-error.ts 保持一致）──
const ApiErrorCode = {
  USER_REQUIRED: 40001,
  PAYMENT_ORDER_NOT_FOUND: 40402,
  FORBIDDEN: 40301,
  ADMIN_AUTH_REQUIRED: 40302,
  PAYMENT_PROVIDER_UNAVAILABLE: 40010,
  PAYMENT_QR_CODE_MISSING: 50001,
} as const;

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { code, message, error: message, ...extra },
    { status },
  );
}

// ── GET 端点 ──
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/payment/orders — 订单历史
  // GET /api/payment/unlocks — 解锁历史
  if (path === "/api/payment/orders" || path === "/api/payment/unlocks") {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const ctx = getContext();
    const paymentsRepo = ctx.payment.paymentsRepo;

    if (path === "/api/payment/orders") {
      const status = url.searchParams.get("status") || "all";
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const offset = (page - 1) * limit;
      const [total, orders] = await Promise.all([
        paymentsRepo.countOrders(auth.userKey, status),
        paymentsRepo.listOrders(auth.userKey, status, limit, offset),
      ]);
      return NextResponse.json({ total, page, limit, list: orders });
    }

    // /api/payment/unlocks
    const lang = url.searchParams.get("lang") || "";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const offset = (page - 1) * limit;
    const [total, unlocks] = await Promise.all([
      paymentsRepo.countUnlocks(auth.userKey),
      paymentsRepo.listUnlocks(auth.userKey, limit, offset, lang ? { lang } : null),
    ]);
    return NextResponse.json({ total, page, limit, list: unlocks });
  }

  // GET /api/payment/orders/:orderNo — 查询订单状态
  if (/^\/api\/payment\/orders\/[^/]+$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const orderNoMatch = path.match(/\/api\/payment\/orders\/([^/]+)$/);
    const orderNo = orderNoMatch?.[1] || "";

    const ctx = getContext();
    const { paymentsRepo, paymentService } = ctx.payment;

    const order = await paymentsRepo.findByOrderNo(orderNo);
    if (!order) return sendError("订单不存在", 404, ApiErrorCode.PAYMENT_ORDER_NOT_FOUND);
    if (order.user_key !== auth.userKey) return sendError("无权操作", 403, ApiErrorCode.FORBIDDEN);

    const tradeNo = url.searchParams.get("trade_no") || "";
    const result = await paymentService.queryOrder(orderNo, tradeNo);
    return NextResponse.json(result);
  }

  // GET /api/payment/alipay/redirect/:orderNo — 支付宝跳转 HTML 表单
  if (/^\/api\/payment\/alipay\/redirect\/[^/]+$/.test(path)) {
    const orderNoMatch = path.match(/\/api\/payment\/alipay\/redirect\/([^/]+)$/);
    const orderNo = orderNoMatch ? decodeURIComponent(orderNoMatch[1]) : "";

    const ctx = getContext();
    const order = await ctx.payment.paymentsRepo.findByOrderNo(orderNo);
    if (!order) return new Response("Order not found", { status: 404 });
    if (order.provider !== "alipay") return new Response("Not an Alipay order", { status: 400 });
    if (order.status !== "pending") return new Response("Order is not pending", { status: 400 });

    // Alipay SDK pageExecute 返回的是自动提交的 HTML 表单，
    // 必须用 text/html 渲染，浏览器加载后自动 POST 到支付宝网关完成跳转。
    return new Response(order.pay_url!, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // GET /api/payment/config-status — 公共支付配置状态（最小字段）
  if (path === "/api/payment/config-status") {
    const ctx = getContext();
    const { paymentService, paymentMode } = ctx.payment;
    const live = paymentMode === "live";
    return NextResponse.json({
      providers: {
        alipay: { configured: live && paymentService.hasStrategy("alipay") },
        wechat: { configured: live && paymentService.hasStrategy("wechat") },
      },
    });
  }

  // GET /api/payments/config-status — 管理员完整配置状态
  if (path === "/api/payments/config-status") {
    const adminAuth = await requireAdmin(req);
    if (adminAuth instanceof Response) return adminAuth;

    const ctx = getContext();
    const { paymentsRepo } = ctx.payment;
    const configs = await paymentsRepo.listActiveProviderConfigs();
    const runtime = getPaymentRuntimeConfig();
    return NextResponse.json({
      ...runtime,
      active_provider_configs: configs.map((item: Record<string, unknown>) => ({
        provider: item.provider,
        mode: item.mode,
        app_id: item.app_id ? `${String(item.app_id).slice(0, 6)}***` : null,
        merchant_id: item.merchant_id ? `${String(item.merchant_id).slice(0, 6)}***` : null,
        notify_url: item.notify_url || null,
        is_active: Boolean(item.is_active),
      })),
      note: runtime.live_enabled
        ? "PAYMENT_MODE=live: 下单会请求真实支付策略；真实付款成功需要支付平台异步通知或主动查询落库。"
        : "PAYMENT_MODE 未设置为 live: 下单会强制走 mock，方便本地闭环测试，不会调支付宝/微信真实网关。",
      providers: {
        ...runtime.providers,
        alipay: {
          ...runtime.providers.alipay,
          source: runtime.providers.alipay.configured ? "env" : configs.some((item: Record<string, unknown>) => item.provider === "alipay") ? "database_config_only" : "none",
        },
        wechat: {
          ...runtime.providers.wechat,
          source: runtime.providers.wechat.configured ? "env" : configs.some((item: Record<string, unknown>) => item.provider === "wechat") ? "database_config_only" : "none",
        },
      },
      required_env: {
        alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"],
        wechat: ["WECHAT_APP_ID", "WECHAT_MCH_ID 或 WECHAT_MERCHANT_ID", "WECHAT_API_V3_KEY", "WECHAT_PRIVATE_KEY", "WECHAT_NOTIFY_URL"],
      },
    });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

// ─ POST 端点 ──
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // POST /api/payment/orders — 创建支付订单
  if (path === "/api/payment/orders") {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const ctx = getContext();
    const { paymentService, paymentMode } = ctx.payment;

    try {
      const body = await req.json();
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "";

      // 与研修班 resolveProvider 对齐：live 模式下仅接受已开通渠道名，其余明确拒绝（不回退 mock）
      const requestedProvider = String(body.provider || "");
      if (paymentMode === "live" && requestedProvider !== "alipay" && requestedProvider !== "wechat") {
        return sendError("PAYMENT_PROVIDER_UNAVAILABLE", 400, ApiErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
      }
      const provider = (paymentMode === "live" ? requestedProvider : "mock") as "alipay" | "wechat" | "mock";

      const result = await paymentService.createOrder({
        user_key: auth.userKey,
        plan_code: String(body.plan_code || ""),
        notice_id: body.notice_id ? Number(body.notice_id) : null,
        provider,
        return_url: String(body.return_url || ""),
        client_ip: clientIp,
        order_type: body.order_type === "upgrade" ? "upgrade" : "new",
        original_plan_code: String(body.original_plan_code || ""),
      });

      const clientPayUrl = result.provider === "alipay"
        ? `/api/payment/alipay/redirect/${encodeURIComponent(result.order_no)}`
        : result.pay_url;

      // 零跳转弹窗支付：必须使用支付渠道返回的原生二维码
      if (!result.qr_code_url) {
        return sendError('支付宝二维码生成失败，请确认已开通\u201C当面付\u201D产品后重试', 500, ApiErrorCode.PAYMENT_QR_CODE_MISSING);
      }
      const qrCodeUrl = await toQrDataUrl(result.qr_code_url);

      return NextResponse.json(
        {
          ...result,
          pay_url: clientPayUrl,
          qr_code_url: qrCodeUrl,
          payment_mode: paymentMode === "live" ? "configured" : "mock",
        },
        { status: 201 },
      );
    } catch (err: unknown) {
      const raw = String((err as Error)?.message || "");
      const friendly = raw.includes("Unsupported payment provider")
        ? "PAYMENT_PROVIDER_UNAVAILABLE"
        : raw.includes("PAYMENT_QR_CODE_MISSING")
          ? '支付宝二维码生成失败，请确认已开通\u201C当面付\u201D产品后重试'
          : raw;
      return sendError(friendly, 400, ApiErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    }
  }

  // POST /api/payments/:orderNo/mock-paid — Mock 支付履约（仅 mock 模式）
  if (/^\/api\/payments\/[^/]+\/mock-paid$/.test(path)) {
    const ctx = getContext();
    // 仅在 mock 模式下注册
    if (ctx.payment.paymentMode === "live") {
      return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
    }

    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const orderNoMatch = path.match(/\/api\/payments\/([^/]+)\/mock-paid$/);
    const orderNo = orderNoMatch?.[1] || "";

    const { paymentsRepo, membershipRepo } = ctx.payment;

    // 归属校验
    const dbOrder = await paymentsRepo.findByOrderNo(orderNo);
    if (!dbOrder) return sendError("订单不存在", 404, ApiErrorCode.PAYMENT_ORDER_NOT_FOUND);
    if (dbOrder.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.FORBIDDEN);

    const body = await req.json().catch(() => ({}));
    const { found } = await fulfillMockPayment(paymentsRepo as any, membershipRepo as any, {
      orderNo,
      rawNotify: JSON.stringify(body || { mock: true }),
    });
    if (!found) return sendError("订单不存在", 404, ApiErrorCode.PAYMENT_ORDER_NOT_FOUND);

    return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
