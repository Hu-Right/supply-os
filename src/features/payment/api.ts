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
import { pickNoticeApiLang } from "@/shared/constants/langs";

/**
 * 关联公告摘要（订单/解锁记录列表内嵌）
 * Related notice brief embedded in order/unlock records
 */
export type OrderNoticeBrief = {
  id: number;
  notice_id?: string | null;
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
  url?: string | null;
  industry?: string | null;
};

/**
 * 支付订单记录——GET /api/payment/orders 的 list 元素（服务端 NormalizedOrder 镜像）。
 * Payment order record（红线② camelCase，不再镜像 DB 列名）
 *
 * @remarks notice 字段对订单始终为空：在线路径（orchestrator.normalizeOrder）
 *          不拼公告摘要，拼摘要的旧 paymentHistory 服务已删除。
 *          解锁行的公告摘要属于 unlocks 端点自身的迁移议题，本批不动。
 */
export type OrderRecord = {
  orderNo: string;
  userId: number;
  businessType?: "membership" | "learning" | "training" | "service";
  provider: "alipay" | "wechat" | "mock";
  planCode: string;
  noticeId?: number | null;
  amount: number;
  currency: string;
  status: string;
  providerTradeNo?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  expiresAt?: string | null;
  notice?: OrderNoticeBrief | null;
};

/**
 * 解锁记录——GET /api/payment/unlocks 的 list 元素。
 * Unlock record
 *
 * ⚠ 本端点尚未迁命名红线：服务端现在是把 repo 平铺行整行透出（静态门禁
 *    看不见展开行），所以这里声明的 notice 与实际 wire 不一致。
 *    unlocks 自己的 mapper 迁入后本类型才会与响应体对齐。
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

// 本地差异 #18：lang 白名单已收敛至 shared/constants/langs（SSOT）

/**
 * 查询用户解锁记录（分页）
 * Fetch user's unlock records (paged)
 *
 * @remarks 传入 locale（zh/en/fr/ru/es/ar）且命中白名单时后端附带公告标题译文 title_i18n，
 *          与公告详情翻译共用缓存（lang 白名单见 shared/constants/langs）。
 */
export async function fetchUnlocks(params: {
  page?: number;
  limit?: number;
  locale?: string;
}): Promise<PagedResult<UnlockRecord>> {
  const qs = buildQuery({
    page: params.page,
    limit: params.limit,
    lang: pickNoticeApiLang(params.locale),
  });
  // P0 性能优化：使用 apiCached 去重并发请求（StrictMode 下 effect 双重执行）
  // 回滚：将 apiCached 替换回 api，删除第二个参数
  return apiCached<PagedResult<UnlockRecord>>(`/api/payment/unlocks?${qs}`, 5 * 60 * 1000);
}
