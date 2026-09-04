/**
 * GET  /api/payment/orders — 订单历史（分页）
 * POST /api/payment/orders — 创建支付订单
 *
 * @module app/api/payment/orders/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { toQrDataUrl } from "@/lib/payment/qr";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";
import { EC_PAYMENT_PROVIDER_UNAVAILABLE, EC_PAYMENT_QR_CODE_MISSING } from "@/shared/constants/api";

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

// ── GET — 订单历史（聚合三表） ──
export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = req.nextUrl;
  const ctx = getContext();
  const { orchestrator } = ctx.payment;

  const status = url.searchParams.get("status") || "all";
  const limit = clampLimit(url.searchParams.get("limit"), DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const offset = (page - 1) * limit;

  const { total, list } = await orchestrator.listAllOrders(auth.userId!, status, limit, offset);
  return NextResponse.json({ total, page, limit, list });
}

// ── POST — 创建支付订单 ──
export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const ctx = getContext();
  const { paymentService, paymentMode } = ctx.payment;

  try {
    const body = await req.json();
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "";

    const requestedProvider = String(body.provider || "");
    if (paymentMode === "live" && requestedProvider !== "alipay" && requestedProvider !== "wechat") {
      return sendError("PAYMENT_PROVIDER_UNAVAILABLE", 400, EC_PAYMENT_PROVIDER_UNAVAILABLE);
    }
    // ARCH-B+（2026-09-04）：live 模式下校验策略是否已注册（密钥是否已配置）
    // 与 training-payment.ts resolveProvider 对齐：未注册则明确拒绝，不在下单时才失败
    if (paymentMode === "live" && !paymentService.hasStrategy(requestedProvider as "alipay" | "wechat")) {
      return sendError("PAYMENT_PROVIDER_UNAVAILABLE", 503, EC_PAYMENT_PROVIDER_UNAVAILABLE);
    }
    const provider = (paymentMode === "live" ? requestedProvider : "mock") as "alipay" | "wechat" | "mock";

    // ARCH-B+（2026-09-01）：学习资料 / 打包套餐订单路由至 LearningPaymentService
    const planCode = String(body.plan_code || "");
    let result;
    if (planCode.startsWith("material_") || planCode.startsWith("bundle_")) {
      result = await ctx.payment.learningPaymentService.createOrder({
        userId: auth.userId!,
        planCode,
        provider,
        returnUrl: String(body.return_url || ""),
        clientIp: clientIp,
      });
    } else {
      result = await paymentService.createOrder({
        user_id: auth.userId!,
        plan_code: planCode,
        notice_id: body.notice_id ? Number(body.notice_id) : null,
        provider,
        return_url: String(body.return_url || ""),
        client_ip: clientIp,
        order_type: body.order_type === "upgrade" ? "upgrade" : "new",
        original_plan_code: String(body.original_plan_code || ""),
        amount: body.amount != null ? Number(body.amount) : undefined,
        bundle_items: Array.isArray(body.bundle_items) ? body.bundle_items : undefined,
      });
    }

    const clientPayUrl = result.provider === "alipay"
      ? `/api/payment/alipay/redirect/${encodeURIComponent(result.order_no)}`
      : result.pay_url;

    if (!result.qr_code_url) {
      return sendError('支付宝二维码生成失败，请确认已开通\u201C当面付\u201D产品后重试', 500, EC_PAYMENT_QR_CODE_MISSING);
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
    console.error("[payment/orders] 创建订单失败:", raw, (err as Error)?.stack);
    const friendly = raw.includes("Unsupported payment provider")
      ? "PAYMENT_PROVIDER_UNAVAILABLE"
      : raw.includes("PAYMENT_QR_CODE_MISSING")
        ? '支付宝二维码生成失败，请确认已开通\u201C当面付\u201D产品后重试'
        : raw.includes("MATERIAL_NOT_FOUND")
          ? "学习资料不存在或已下架"
          : raw.includes("BUNDLE_NOT_FOUND")
            ? "打包套餐不存在或已下架"
            : raw.includes("SINGLE_FIRST_PURCHASE_ONLY")
              ? "首单特惠仅限首次购买，请选择标准单次解锁"
              : "创建订单失败，请稍后重试";
    // 首单资格冲突用 409 让前端能区分提示
    if (raw.includes("SINGLE_FIRST_PURCHASE_ONLY")) {
      return sendError(friendly, 409, EC_PAYMENT_PROVIDER_UNAVAILABLE);
    }
    return sendError(friendly, 400, EC_PAYMENT_PROVIDER_UNAVAILABLE);
  }
}
