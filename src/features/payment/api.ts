/**
 * 支付相关 API 调用
 * Payment API Calls
 *
 * @module features/payment/api
 * @description 封装支付订单创建和状态查询的网络请求
 *              Encapsulates payment order creation and status polling requests
 */

export type OrderInfo = {
  order_no: string;
  pay_url: string;
  qr_code_url?: string;
  provider: "alipay" | "wechat" | "mock";
  status: "pending" | "paid" | "closed" | "failed";
  notice_id?: number | null;
  /** 支付模式：configured=真实网关，mock=本地模拟 */
  payment_mode?: "configured" | "mock";
  plan_code?: string;
  amount?: number;
  currency?: string;
};

export type CreateOrderParams = {
  userKey: string;
  planCode: string;
  provider: "alipay" | "wechat" | "mock";
  noticeId?: number | null;
  /** 支付完成后的回跳地址（缺省为当前页 origin+pathname） */
  returnUrl?: string;
};

/**
 * 创建支付订单
 * Create payment order
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderInfo> {
  const res = await fetch("/api/payment/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_key: params.userKey,
      plan_code: params.planCode,
      provider: params.provider,
      notice_id: params.noticeId ?? null,
      return_url: params.returnUrl || window.location.origin + window.location.pathname,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "创建订单失败");
  }

  return res.json();
}

/**
 * 查询订单状态
 * Query order status
 */
export async function getOrderStatus(orderNo: string, tradeNo?: string): Promise<OrderInfo> {
  const url = tradeNo
    ? `/api/payment/orders/${orderNo}?trade_no=${encodeURIComponent(tradeNo)}`
    : `/api/payment/orders/${orderNo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("查询订单失败");
  return res.json();
}

/**
 * 本地模拟支付确认（mock 模式下手动完成付款）
 * Mock payment confirmation (manually complete payment under mock mode)
 */
export async function mockPaid(orderNo: string): Promise<void> {
  const res = await fetch(`/api/payments/${encodeURIComponent(orderNo)}/mock-paid`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("确认支付失败");
}

/**
 * 关联公告摘要（订单/解锁记录列表内嵌）
 * Related notice brief embedded in order/unlock records
 */
export type OrderNoticeBrief = {
  id: number;
  notice_id?: string | null;
  source_channel?: string | null;
  reference?: string | null;
  title?: string | null;
  /** 当前界面语言的标题译文（仅 fetchUnlocks 传 lang 时返回；缺译为 null） */
  title_i18n?: string | null;
  notice_type?: string | null;
  agency?: string | null;
  agency_full?: string | null;
  country?: string | null;
  deadline?: string | null;
  urgency?: string | null;
  url?: string | null;
  industry?: string | null;
};

/**
 * 支付订单记录
 * Payment order record
 */
export type OrderRecord = {
  order_no: string;
  user_key: string;
  provider: "alipay" | "wechat" | "mock";
  plan_code: string;
  notice_id?: number | null;
  amount: number;
  currency: string;
  status: string;
  provider_trade_no?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notice?: OrderNoticeBrief | null;
};

/**
 * 解锁记录
 * Unlock record
 */
export type UnlockRecord = {
  user_key: string;
  notice_id: number;
  unlock_type: string;
  price: number;
  unlocked_at?: string | null;
  notice?: OrderNoticeBrief | null;
};

/**
 * 分页结果包裹
 * Paged result wrapper
 */
export type PagedResult<T> = {
  total: number;
  page: number;
  limit: number;
  list: T[];
};

/**
 * 查询用户支付订单（分页）
 * Fetch user's payment orders (paged)
 */
export async function fetchOrders(params: {
  userKey: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PagedResult<OrderRecord>> {
  const search = new URLSearchParams({ user_key: params.userKey });
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const res = await fetch(`/api/payment/orders?${search.toString()}`);
  if (!res.ok) throw new Error("查询订单记录失败");
  return res.json();
}

// 公告原文为英文：除 en 外的界面语言都请求译文（与后端 NOTICE_TRANSLATION_LANGS 对齐）
const NOTICE_API_LANGS = new Set(["zh", "fr", "ru", "es", "ar"]);

/**
 * 查询用户解锁记录（分页）
 * Fetch user's unlock records (paged)
 *
 * @remarks 传入 locale（zh/fr/ru/es/ar）时后端附带公告标题译文 title_i18n，
 *          与公告详情翻译共用缓存；en 为原文语言不传 lang。
 */
export async function fetchUnlocks(params: {
  userKey: string;
  page?: number;
  limit?: number;
  locale?: string;
}): Promise<PagedResult<UnlockRecord>> {
  const search = new URLSearchParams({ user_key: params.userKey });
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.locale && NOTICE_API_LANGS.has(params.locale)) search.set("lang", params.locale);
  const res = await fetch(`/api/payment/unlocks?${search.toString()}`);
  if (!res.ok) throw new Error("查询解锁记录失败");
  return res.json();
}
