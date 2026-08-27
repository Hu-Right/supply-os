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

const ApiErrorCode = {
  USER_REQUIRED: 40001,
  PAYMENT_PROVIDER_UNAVAILABLE: 40010,
  PAYMENT_QR_CODE_MISSING: 50001,
} as const;

function sendError(message: string, status: number, code: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

// ── GET — 订单历史 ──
export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = req.nextUrl;
  const ctx = getContext();
  const { paymentsRepo } = ctx.payment;

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
