/**
 * GET  /api/payment/orders — 订单历史（分页）
 * POST /api/payment/orders — 创建支付订单
 *
 * @module app/api/payment/orders/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { toQrDataUrl } from "@/lib/payment/qr";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, clampLimit } from "@/shared/constants/api";
import {
  EC_PAYMENT_PROVIDER_UNAVAILABLE, EC_PAYMENT_QR_CODE_MISSING,
  EC_PAYMENT_PLAN_NOT_FOUND, EC_PAYMENT_MATERIAL_NOT_FOUND, EC_PAYMENT_BUNDLE_NOT_FOUND,
  EC_PAYMENT_USER_PLAN_REQUIRED, EC_PAYMENT_PLAN_NOT_SELLABLE, EC_PAYMENT_AMOUNT_INVALID,
  EC_PAYMENT_FREE_PLAN, EC_PAYMENT_UPGRADE_INVALID, EC_PAYMENT_SINGLE_FIRST_PURCHASE,
  EC_PAYMENT_SERVICE_UNAVAILABLE, EC_PAYMENT_SERVICE_ADVISORY_ONLY,
} from "@/shared/constants/api";

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

    const ctx = getContext();
    const { paymentService, paymentMode } = ctx.payment;

    try {
      const body = await req.json();
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "";

      const requestedProvider = String(body.provider || "");
      if (paymentMode === "live" && requestedProvider !== "alipay" && requestedProvider !== "wechat") {
        routeError(400, EC_PAYMENT_PROVIDER_UNAVAILABLE, "支付渠道暂不可用");
      }
      // ARCH-B+（2026-09-04）：live 模式下校验策略是否已注册（密钥是否已配置）
      // 与 training-payment.ts resolveProvider 对齐：未注册则明确拒绝，不在下单时才失败
      if (paymentMode === "live" && !paymentService.hasStrategy(requestedProvider as "alipay" | "wechat")) {
        routeError(503, EC_PAYMENT_PROVIDER_UNAVAILABLE, "支付渠道暂不可用");
      }
      const provider = (paymentMode === "live" ? requestedProvider : "mock") as "alipay" | "wechat" | "mock";

      // ARCH-B+（2026-09-01）：学习资料 / 打包套餐订单路由至 LearningPaymentService
      const planCode = String(body.plan_code || "");
      let result;
      if (planCode.startsWith("material_") || planCode.startsWith("bundle_")) {
        result = await ctx.payment.learningPaymentService.createOrder({
          userId: auth.userId,
          planCode,
          provider,
          returnUrl: String(body.return_url || ""),
          clientIp: clientIp,
        });
      } else if (planCode.startsWith("svc_")) {
        // 增值服务一次性下单：读 crm_service_catalog 定价、写 crm_service_orders（不动会员核心）
        result = await ctx.payment.servicePaymentService.createOrder({
          userId: auth.userId,
          serviceCode: planCode,
          provider,
          returnUrl: String(body.return_url || ""),
          clientIp: clientIp,
        });
      } else {
        result = await paymentService.createOrder({
          user_id: auth.userId,
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
        ? `/api/payment/alipay/redirect/${encodeURIComponent(result.orderNo)}`
        : result.payUrl;

      // 仅支付宝通道强制二维码（当面付 precreate）；mock 等跳转式通道
      // 以 payUrl 为准（MockProvider 有意不返回 qrCodeUrl）
      if (result.provider === "alipay" && !result.qrCodeUrl) {
        routeError(500, EC_PAYMENT_QR_CODE_MISSING, '支付宝二维码生成失败，请确认已开通\u201C当面付\u201D产品后重试');
      }
      const qrCodeUrl = result.qrCodeUrl ? await toQrDataUrl(result.qrCodeUrl) : null;

      return NextResponse.json(
        {
          ...result,
          payUrl: clientPayUrl,
          qrCodeUrl,
          paymentMode: paymentMode === "live" ? "configured" : "mock",
        },
        { status: 201 },
      );
    } catch (err: unknown) {
      // 内层有意抛出的业务错（如上方 routeError 的渠道/二维码判定）直接上抛，交由 withRoute 按原 status/code 输出。
      if (err instanceof RouteError) throw err;
      const raw = String((err as Error)?.message || "");
      console.error("[payment/orders] 创建订单失败:", raw, (err as Error)?.stack);
      // 按服务层抛出的稳定令牌映射到支付细分码（前端据 code→i18n 精确翻译；message 保留中文作 zh 兜底）。
      const map: Array<{ token: string; status: number; code: number; message: string }> = [
        { token: "Unsupported payment provider", status: 400, code: EC_PAYMENT_PROVIDER_UNAVAILABLE, message: "支付渠道暂不可用" },
        { token: "PAYMENT_PROVIDER_UNAVAILABLE", status: 400, code: EC_PAYMENT_PROVIDER_UNAVAILABLE, message: "支付渠道暂不可用" },
        { token: "PAYMENT_QR_CODE_MISSING", status: 500, code: EC_PAYMENT_QR_CODE_MISSING, message: "支付宝二维码生成失败，请确认已开通当面付产品后重试" },
        { token: "MATERIAL_NOT_FOUND", status: 404, code: EC_PAYMENT_MATERIAL_NOT_FOUND, message: "学习资料不存在或已下架" },
        { token: "BUNDLE_NOT_FOUND", status: 404, code: EC_PAYMENT_BUNDLE_NOT_FOUND, message: "打包套餐不存在或已下架" },
        { token: "SERVICE_ADVISORY_ONLY", status: 400, code: EC_PAYMENT_SERVICE_ADVISORY_ONLY, message: "该服务仅顾问对接，不支持自助下单" },
        { token: "SERVICE_UNAVAILABLE", status: 400, code: EC_PAYMENT_SERVICE_UNAVAILABLE, message: "该服务暂不支持在线下单" },
        { token: "SINGLE_FIRST_PURCHASE_ONLY", status: 409, code: EC_PAYMENT_SINGLE_FIRST_PURCHASE, message: "首单特惠仅限首次购买，请选择标准单次解锁" },
        { token: "USER_AND_PLAN_REQUIRED", status: 400, code: EC_PAYMENT_USER_PLAN_REQUIRED, message: "请先登录后再尝试支付" },
        { token: "PLAN_NOT_SELLABLE", status: 400, code: EC_PAYMENT_PLAN_NOT_SELLABLE, message: "该套餐暂不可自助成交，请联系客服" },
        { token: "PLAN_NOT_FOUND", status: 404, code: EC_PAYMENT_PLAN_NOT_FOUND, message: "未找到对应的套餐方案，请刷新后重试" },
        { token: "FREE_PLAN_NO_PAYMENT_REQUIRED", status: 400, code: EC_PAYMENT_FREE_PLAN, message: "免费套餐无需支付" },
        { token: "UPGRADE_SOURCE_INVALID", status: 400, code: EC_PAYMENT_UPGRADE_INVALID, message: "升级来源已变化，请重新发起升级" },
        { token: "AMOUNT_MISMATCH", status: 400, code: EC_PAYMENT_AMOUNT_INVALID, message: "支付金额异常，请联系客服处理" },
        { token: "AMOUNT_INVALID", status: 400, code: EC_PAYMENT_AMOUNT_INVALID, message: "支付金额异常，请联系客服处理" },
      ];
      const hit = map.find((m) => raw.includes(m.token));
      if (hit) routeError(hit.status, hit.code, hit.message);
      routeError(500, EC_PAYMENT_PROVIDER_UNAVAILABLE, "支付创建失败，请稍后重试或更换支付方式");
    }
  },
);
