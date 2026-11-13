/**
 * 统一下单执行器
 * Unified order creation
 *
 * @module lib/payment/orders/create-order
 * @description 「一次下单」的全部编排：渠道闸口 → 商品分派 → 二维码硬卡 → 错误令牌映射。
 *              `/api/payment/orders`（旧入口，按 plan_code 前缀）与 `/api/orders`（新入口，
 *              按 product_kind + product_code）都只是**适配器**：解析各自的请求体、转成
 *              同一份 legacy body，然后调这里。两个入口因此不可能出现行为漂移。
 *
 *              为什么这里不抛 RouteError：本模块要被两条路由与单测共用，返回
 *              `{ ok:false, status, code, message }` 比抛异常更好断言；路由拿到后一行
 *              `routeError(...)` 输出，与原实现的 status/code/message 逐字一致。
 */
import "server-only";
import type { OrderInfo } from "@/types/payment";
import { getContext } from "@/lib/db/context";
import { toQrDataUrl } from "@/lib/payment/qr";
import { classifyProductCode, PRODUCT_KIND, type ProductKind } from "@/shared/constants/product-kind";
import {
  EC_PAYMENT_PROVIDER_UNAVAILABLE,
  EC_PAYMENT_QR_CODE_MISSING,
  EC_PAYMENT_PLAN_NOT_FOUND,
  EC_PAYMENT_MATERIAL_NOT_FOUND,
  EC_PAYMENT_BUNDLE_NOT_FOUND,
  EC_PAYMENT_USER_PLAN_REQUIRED,
  EC_PAYMENT_PLAN_NOT_SELLABLE,
  EC_PAYMENT_AMOUNT_INVALID,
  EC_PAYMENT_FREE_PLAN,
  EC_PAYMENT_UPGRADE_INVALID,
  EC_PAYMENT_SERVICE_UNAVAILABLE,
  EC_PAYMENT_SERVICE_ADVISORY_ONLY,
  EC_PAYMENT_INDUSTRY_REQUIRED,
  EC_PAYMENT_INDUSTRY_INVALID,
} from "@/shared/constants/api";

export type OrderFail = { ok: false; status: number; code: number; message: string };
export type OrderOk = { ok: true; result: OrderInfo; paymentMode: "live" | "mock" };
export type OrderOutcome = OrderOk | OrderFail;

const fail = (status: number, code: number, message: string): OrderFail => ({ ok: false, status, code, message });

/**
 * 服务层错误令牌 → 支付细分码。
 * 顺序有意义：`find` 取第一条命中，短令牌不要排在长令牌之前（如 AMOUNT_INVALID / AMOUNT_MISMATCH）。
 */
const ORDER_ERROR_MAP: ReadonlyArray<{ token: string; status: number; code: number; message: string }> = [
  { token: "Unsupported payment provider", status: 400, code: EC_PAYMENT_PROVIDER_UNAVAILABLE, message: "支付渠道暂不可用" },
  { token: "PAYMENT_PROVIDER_UNAVAILABLE", status: 400, code: EC_PAYMENT_PROVIDER_UNAVAILABLE, message: "支付渠道暂不可用" },
  { token: "PAYMENT_QR_CODE_MISSING", status: 500, code: EC_PAYMENT_QR_CODE_MISSING, message: "支付宝二维码生成失败，请确认已开通当面付产品后重试" },
  { token: "MATERIAL_NOT_FOUND", status: 404, code: EC_PAYMENT_MATERIAL_NOT_FOUND, message: "学习资料不存在或已下架" },
  { token: "BUNDLE_NOT_FOUND", status: 404, code: EC_PAYMENT_BUNDLE_NOT_FOUND, message: "打包套餐不存在或已下架" },
  { token: "SERVICE_ADVISORY_ONLY", status: 400, code: EC_PAYMENT_SERVICE_ADVISORY_ONLY, message: "该服务仅顾问对接，不支持自助下单" },
  { token: "SERVICE_UNAVAILABLE", status: 400, code: EC_PAYMENT_SERVICE_UNAVAILABLE, message: "该服务暂不支持在线下单" },
  { token: "USER_AND_PLAN_REQUIRED", status: 400, code: EC_PAYMENT_USER_PLAN_REQUIRED, message: "请先登录后再尝试支付" },
  { token: "PLAN_NOT_SELLABLE", status: 400, code: EC_PAYMENT_PLAN_NOT_SELLABLE, message: "该套餐暂不可自助成交，请联系客服" },
  { token: "PLAN_NOT_FOUND", status: 404, code: EC_PAYMENT_PLAN_NOT_FOUND, message: "未找到对应的套餐方案，请刷新后重试" },
  { token: "FREE_PLAN_NO_PAYMENT_REQUIRED", status: 400, code: EC_PAYMENT_FREE_PLAN, message: "免费套餐无需支付" },
  { token: "UPGRADE_SOURCE_INVALID", status: 400, code: EC_PAYMENT_UPGRADE_INVALID, message: "升级来源已变化，请重新发起升级" },
  { token: "AMOUNT_MISMATCH", status: 400, code: EC_PAYMENT_AMOUNT_INVALID, message: "支付金额异常，请联系客服处理" },
  { token: "AMOUNT_INVALID", status: 400, code: EC_PAYMENT_AMOUNT_INVALID, message: "支付金额异常，请联系客服处理" },
  { token: "INDUSTRY_REQUIRED", status: 400, code: EC_PAYMENT_INDUSTRY_REQUIRED, message: "购买会员前请先选择行业大类" },
  { token: "INVALID_INDUSTRY", status: 400, code: EC_PAYMENT_INDUSTRY_INVALID, message: "所选行业大类无效，请重新选择" },
];

/** 服务层错误令牌 → 细分码；未命中落通用失败 */
export function mapOrderError(raw: string): OrderFail {
  const hit = ORDER_ERROR_MAP.find((m) => raw.includes(m.token));
  if (hit) return fail(hit.status, hit.code, hit.message);
  return fail(500, EC_PAYMENT_PROVIDER_UNAVAILABLE, "支付创建失败，请稍后重试或更换支付方式");
}

/**
 * 创建订单（两个入口共用的唯一实现）。
 * @param body 归一后的下单体：`plan_code` 为**目录里的真实商品码**
 *             （service 含 `svc_` 前缀；material/bundle 含命名空间前缀）
 * @param clientIp 渠道下单需要的客户端 IP
 */
export async function createOrder(
  userId: number,
  body: Record<string, unknown>,
  clientIp: string,
): Promise<OrderOutcome> {
  const ctx = getContext();
  const { paymentService, paymentMode } = ctx.payment;

  // ── 渠道闸口（live 模式下必须显式指定已注册的渠道）──
  const requestedProvider = String(body.provider || "");
  if (paymentMode === "live" && requestedProvider !== "alipay" && requestedProvider !== "wechat") {
    return fail(400, EC_PAYMENT_PROVIDER_UNAVAILABLE, "支付渠道暂不可用");
  }
  if (paymentMode === "live" && !paymentService.hasStrategy(requestedProvider as "alipay" | "wechat")) {
    return fail(503, EC_PAYMENT_PROVIDER_UNAVAILABLE, "支付渠道暂不可用");
  }
  const provider = (paymentMode === "live" ? requestedProvider : "mock") as "alipay" | "wechat" | "mock";

  const planCode = String(body.plan_code || "");
  const productKind = classifyProductCode(planCode);

  try {
    let result: OrderInfo;
    if (productKind === PRODUCT_KIND.MATERIAL || productKind === PRODUCT_KIND.BUNDLE) {
      result = await ctx.payment.learningPaymentService.createOrder({
        userId,
        planCode,
        provider,
        returnUrl: String(body.return_url || ""),
        clientIp,
      });
    } else if (productKind === PRODUCT_KIND.SERVICE) {
      // ⚠ serviceCode 传原码（svc_ 属于 SKU 码本身，不能剥前缀）
      result = await ctx.payment.servicePaymentService.createOrder({
        userId,
        serviceCode: planCode,
        provider,
        returnUrl: String(body.return_url || ""),
        clientIp,
      });
    } else {
      result = await paymentService.createOrder({
        user_id: userId,
        plan_code: planCode,
        industry_code: String(body.industry_code || ""),
        provider,
        return_url: String(body.return_url || ""),
        client_ip: clientIp,
        order_type: body.order_type === "upgrade" ? "upgrade" : "new",
        original_plan_code: String(body.original_plan_code || ""),
        amount: body.amount != null ? Number(body.amount) : undefined,
        bundle_items: Array.isArray(body.bundle_items) ? body.bundle_items : undefined,
      });
    }

    // 仅支付宝通道强制二维码（当面付 precreate）；mock 等跳转式通道以 payUrl 为准
    if (result.provider === "alipay" && !result.qrCodeUrl) {
      return fail(500, EC_PAYMENT_QR_CODE_MISSING, "支付宝二维码生成失败，请确认已开通“当面付”产品后重试");
    }

    return { ok: true, result, paymentMode };
  } catch (err: unknown) {
    const raw = String((err as Error)?.message || "");
    console.error("[payment/orders] 创建订单失败:", raw, (err as Error)?.stack);
    return mapOrderError(raw);
  }
}

/**
 * 建单响应体（显式列举，禁止 spread）。
 * 三条 createOrder 任一在服务里加字段都不该直接变成对外键 —— 命名红线② 2026-10-28。
 */
export async function orderViewOf(result: OrderInfo, paymentMode: "live" | "mock") {
  const clientPayUrl = result.provider === "alipay"
    ? `/api/payment/alipay/redirect/${encodeURIComponent(result.orderNo)}`
    : result.payUrl;
  const qrCodeUrl = result.qrCodeUrl ? await toQrDataUrl(result.qrCodeUrl) : null;
  return {
    orderNo: result.orderNo,
    provider: result.provider,
    status: result.status,
    payUrl: clientPayUrl,
    qrCodeUrl,
    paymentMode: paymentMode === "live" ? "configured" : "mock",
    // 以下为可选契约键：服务未给时 JSON 自然不包（与 spread 时代行为一致）
    noticeId: result.noticeId,
    planCode: result.planCode,
    amount: result.amount,
    currency: result.currency,
    createdAt: result.createdAt,
  };
}

// ── 新入口的请求体翻译 ─────────────────────────────────────────────

/** 新入口支持的商品类型（培训走自己的路由：需期次/人数/联系人，且无商品码） */
const SUPPORTED_KINDS: ReadonlyArray<ProductKind> = [
  PRODUCT_KIND.PLAN,
  PRODUCT_KIND.SERVICE,
  PRODUCT_KIND.MATERIAL,
  PRODUCT_KIND.BUNDLE,
];

export type TranslateResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * `{ product_kind, product_code }` → legacy body（`plan_code` 为真实商品码）。
 *
 * 约定：`product_code` 传**目录主键**——
 * - plan / service：原样（service 的 `svc_` 属于码本身）
 * - material / bundle：不带命名空间前缀（本函数补），传了带前缀的也认（先剥再补，幂等）
 *
 * 翻译后**回判一次类型**：kind 与 code 对不上直接 400，不让它走到服务层才报
 * 「套餐不存在」那种误导性错误。
 */
export function translateProductRequest(input: Record<string, unknown>): TranslateResult {
  const kind = String(input.product_kind || "");
  const code = String(input.product_code || "").trim();

  if (!code) return { ok: false, message: "缺少 product_code" };
  if (!SUPPORTED_KINDS.includes(kind as ProductKind)) {
    return {
      ok: false,
      message: `product_kind 必须是 ${SUPPORTED_KINDS.join(" / ")}；培训下单请走 /api/training/orders（需期次、人数与联系人）`,
    };
  }

  let planCode: string;
  if (kind === PRODUCT_KIND.MATERIAL) {
    planCode = code.startsWith("material_") ? code : `material_${code}`;
  } else if (kind === PRODUCT_KIND.BUNDLE) {
    planCode = code.startsWith("bundle_") ? code : `bundle_${code}`;
  } else {
    planCode = code;
  }

  // 回判：kind 与最终码形必须一致（防 kind=plan 却传了 svc_x 这类错配）
  if (classifyProductCode(planCode) !== kind) {
    return { ok: false, message: `product_code 与 product_kind 不匹配：${code} 不是 ${kind} 类商品` };
  }

  return {
    ok: true,
    body: {
      plan_code: planCode,
      provider: input.provider,
      return_url: input.return_url,
      industry_code: input.industry_code,
      order_type: input.order_type,
      original_plan_code: input.original_plan_code,
      amount: input.amount,
      bundle_items: input.bundle_items,
    },
  };
}
