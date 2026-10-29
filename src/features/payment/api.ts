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
 * 关联公告摘要（解锁记录内嵌）
 * Related notice brief embedded in unlock records
 *
 * 镜像 lib/services/payment-history-view 的 UnlockNoticeBriefView（红线② camelCase）。
 */
export type OrderNoticeBrief = {
  reference?: string | null;
  title?: string | null;
  /** 服务表中文标题缓存（中文界面优先） */
  titleCn?: string | null;
  /** 当前界面语言的标题译文（仅 fetchUnlocks 传 lang 时返回；缺译为 null） */
  titleI18n?: string | null;
  noticeType?: string | null;
  agency?: string | null;
  agencyFull?: string | null;
  country?: string | null;
  deadline?: string | null;
  /** 公采搜索功能（本地差异 #6 配套）：服务端按 deadline_ts 算好的过期标志（无时间戳为 null） */
  deadlineExpired?: boolean | null;
  url?: string | null;
  industry?: string | null;
};

/**
 * 支付订单记录——GET /api/payment/orders 的 list 元素（服务端 NormalizedOrder 镜像）。
 * Payment order record（红线② camelCase，不再镜像 DB 列名）
 *
 * @remarks notice 字段对订单不返回：在线路径（orchestrator.normalizeOrder）
 *          不拼公告摘要，拼摘要的旧 paymentHistory 服务已删除。
 *          解锁行（UnlockRecord）才带公告摘要。
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
 * Unlock record（镜像服务端 UnlockRecordView，红线② camelCase）
 *
 * 历史：这一族曾经把 repo 平铺行直接 json 出去，而本类型声明的是嵌套 notice，
 * 所以解锁行的标题/国家/编号/截止日/过期标记在运行时全为空；
 * 现在 wire 按本形状出，user_id 与 description 不再外发。
 */
export type UnlockRecord = {
  noticeId: number;
  unlockType: string;
  price: number;
  unlockedAt?: string | null;
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
