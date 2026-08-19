/**
 * 支付相关 API 调用
 * Payment API Calls
 *
 * @module features/payment/api
 * @description 封装支付订单创建和状态查询的网络请求
 *              Encapsulates payment order creation and status polling requests
 */

import { api, apiCached, buildQuery } from "@/core/http";
import type { OrderInfo } from "@/types/payment";

export type { OrderInfo };

export type CreateOrderParams = {
  planCode: string;
  provider: "alipay" | "wechat" | "mock";
  noticeId?: number | null;
  /** 支付完成后的回跳地址（缺省为当前页 origin+pathname） */
  returnUrl?: string;
  /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
  orderType?: "new" | "upgrade";
  /** 升级时的当前套餐 code（服务端校验用） */
  originalPlanCode?: string;
};

/**
 * 创建支付订单
 * Create payment order
 * B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，订单归属由 JWT 身份决定
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderInfo> {
  return api<OrderInfo>("/api/payment/orders", {
    method: "POST",
    body: {
      plan_code: params.planCode,
      provider: params.provider,
      notice_id: params.noticeId ?? null,
      return_url: params.returnUrl || window.location.origin + window.location.pathname,
      order_type: params.orderType || "new",
      original_plan_code: params.originalPlanCode || "",
    },
  });
}

/**
 * 查询订单状态
 * Query order status
 */
export async function getOrderStatus(orderNo: string, tradeNo?: string): Promise<OrderInfo> {
  const url = tradeNo
    ? `/api/payment/orders/${orderNo}?trade_no=${encodeURIComponent(tradeNo)}`
    : `/api/payment/orders/${orderNo}`;
  return api<OrderInfo>(url);
}

/**
 * 本地模拟支付确认（mock 模式下手动完成付款）
 * Mock payment confirmation (manually complete payment under mock mode)
 */
export async function mockPaid(orderNo: string): Promise<void> {
  await api<void>(`/api/payments/${encodeURIComponent(orderNo)}/mock-paid`, {
    method: "POST",
  });
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
  /** 公采搜索功能（本地差异 #6 配套）：服务端按 deadline_ts 算好的过期标志（无时间戳为 null） */
  deadline_expired?: boolean | null;
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
 * B1 legacy 退役：user_key 兜底参数已删除，服务端按 JWT 身份查询
 */
export async function fetchOrders(params: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PagedResult<OrderRecord>> {
  const qs = buildQuery({
    status: params.status,
    page: params.page,
    limit: params.limit,
  });
  return api<PagedResult<OrderRecord>>(`/api/payment/orders?${qs}`);
}

// 本地差异 #18：库内存在中文原文公告，en 也需请求译文（英文原文由服务端内容检测直通返回，不耗 API）
const NOTICE_API_LANGS = new Set(["zh", "en", "fr", "ru", "es", "ar"]);

/**
 * 查询用户解锁记录（分页）
 * Fetch user's unlock records (paged)
 *
 * @remarks 传入 locale（zh/fr/ru/es/ar）时后端附带公告标题译文 title_i18n，
 *          与公告详情翻译共用缓存；en 为原文语言不传 lang。
 */
export async function fetchUnlocks(params: {
  page?: number;
  limit?: number;
  locale?: string;
}): Promise<PagedResult<UnlockRecord>> {
  const qs = buildQuery({
    page: params.page,
    limit: params.limit,
    lang: params.locale && NOTICE_API_LANGS.has(params.locale) ? params.locale : undefined,
  });
  // P0 性能优化：使用 apiCached 去重并发请求（StrictMode 下 effect 双重执行）
  // 回滚：将 apiCached 替换回 api，删除第二个参数
  return apiCached<PagedResult<UnlockRecord>>(`/api/payment/unlocks?${qs}`, 5 * 60 * 1000);
}
