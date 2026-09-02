/**
 * 支付操作核心 API — 跨 feature 统一入口
 * Payment Core API — Cross-feature unified entry point
 *
 * @module core/payment/api
 * @description ARCH-P4a（2026-09-01）：从 features/payment/api 提升核心三函数
 *              （createOrder / getOrderStatus / mockPaid）至 core 层。
 *              消除 core/payment/payment-facade → features/payment 的反向依赖。
 *
 *              权威实现原位于 features/payment/api.ts，本文件为提升后的权威端口，
 *              原路径改为 re-export 保持存量导入兼容。
 */
import { api } from "@/core/http";
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
  /** 学习资料/打包套餐的指定金额（跳过套餐表查找） */
  amount?: number;
  /** 打包套餐包含的资料 ID 列表 */
  bundleItems?: string[];
};

/**
 * 创建支付订单
 * B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，订单归属由 JWT 身份决定
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderInfo> {
  const body = {
    plan_code: params.planCode,
    provider: params.provider,
    notice_id: params.noticeId ?? null,
    return_url: params.returnUrl || window.location.origin + window.location.pathname,
    order_type: params.orderType || "new",
    original_plan_code: params.originalPlanCode || "",
    amount: params.amount,
    bundle_items: params.bundleItems,
  };
  return api<OrderInfo>("/api/payment/orders", {
    method: "POST",
    body,
  });
}

/**
 * 查询订单状态
 */
export async function getOrderStatus(orderNo: string, tradeNo?: string): Promise<OrderInfo> {
  const url = tradeNo
    ? `/api/payment/orders/${orderNo}?trade_no=${encodeURIComponent(tradeNo)}`
    : `/api/payment/orders/${orderNo}`;
  return api<OrderInfo>(url);
}

/**
 * 本地模拟支付确认（mock 模式下手动完成付款）
 */
export async function mockPaid(orderNo: string): Promise<void> {
  await api<void>(`/api/payments/${encodeURIComponent(orderNo)}/mock-paid`, {
    method: "POST",
  });
}
