/**
 * 支付相关 API 调用
 * Payment API Calls
 *
 * @module features/payment/api
 * @description ARCH-P4a（2026-09-01）：核心三函数（createOrder/getOrderStatus/mockPaid）
 *              已提升至 core/payment/api.ts，本文件改为 re-export 保持存量导入兼容。
 *              新增代码应从 @/core/payment/api 导入。
 *
 *              本文件保留 fetchOrders/fetchUnlocks 等 feature 级查询 API。
 */

// ── 核心支付操作（权威实现在 core/payment/api）──
export {
  createOrder,
  getOrderStatus,
  mockPaid,
} from "@/core/payment/api";
export type { CreateOrderParams } from "@/core/payment/api";
export type { OrderInfo } from "@/types/payment";

// ── feature 级查询 API（以下为 features/payment 私有）──

import { api, apiCached, buildQuery } from "@/core/http";

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
  user_id: number;
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
  user_id: number;
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
