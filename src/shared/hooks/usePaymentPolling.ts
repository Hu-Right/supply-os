/**
 * 支付轮询状态机 Hook（SSOT）
 * Payment Polling State Machine Hook — Single Source of Truth
 *
 * @module shared/hooks/usePaymentPolling
 * @description ARCH-P2（2026-09-01）：从 usePaymentFlow / useNoticePayment
 *              提取的公共轮询基础设施。封装 interval 管理、epoch 令牌守卫、
 *              超时/终态判定。消费方只需提供 queryStatus 回调和事件处理。
 *
 *              ARCH-P2-解耦（2026-09-05）：从 features/payment/hooks/ 提升至
 *              shared/hooks/，消除 procurement→payment 跨 feature 硬依赖。
 *              原位置保留 re-export 兼容存量导入。
 */
import { useCallback, useEffect, useRef } from "react";
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_MAX_ATTEMPTS } from "@/core/payment";
import { ORDER_STATUS } from "@/shared/constants/order-status";

export interface UsePaymentPollingCallbacks {
  /** 查询订单状态 */
  queryStatus: (orderNo: string) => Promise<{ status: string }>;
  /** 订单已支付 */
  onPaid: (orderNo: string) => void;
  /** 订单失败/关闭/过期 */
  onFailed: (orderNo: string) => void;
  /** 轮询超时（达到 maxAttempts） */
  onTimeout: (orderNo: string) => void;
}

export interface UsePaymentPollingOptions {
  /** 轮询间隔（毫秒），默认 PAYMENT_POLL_INTERVAL_MS（3s） */
  intervalMs?: number;
  /** 最大轮询次数，默认 PAYMENT_POLL_MAX_ATTEMPTS（200 ≈ 10min） */
  maxAttempts?: number;
}

export interface UsePaymentPollingReturn {
  /** 启动轮询（自动停止之前的轮询） */
  startPolling: (orderNo: string) => void;
  /** 停止轮询（epoch 守卫确保在途响应失效） */
  stopPolling: () => void;
}

/** 终态集合：匹配到此状态即停止轮询 */
const TERMINAL_STATUSES = new Set(["paid", "closed", "failed", "expired"]);

export function usePaymentPolling(
  callbacks: UsePaymentPollingCallbacks,
  options?: UsePaymentPollingOptions,
): UsePaymentPollingReturn {
  const intervalMs = options?.intervalMs ?? PAYMENT_POLL_INTERVAL_MS;
  const maxAttempts = options?.maxAttempts ?? PAYMENT_POLL_MAX_ATTEMPTS;

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 轮询轮次令牌（审查 F44）：stop 后在途的慢响应必须失效，防回调双触发
  const pollEpochRef = useRef(0);

  // 回调 ref：保持最新引用，避免 useCallback 依赖变化导致轮询重启
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const stopPolling = useCallback(() => {
    pollEpochRef.current += 1;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 组件卸载时清理轮询
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (orderNo: string) => {
      stopPolling();
      const epoch = pollEpochRef.current;
      let attempts = 0;

      pollingRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const result = await callbacksRef.current.queryStatus(orderNo);
          // epoch 守卫：轮询已停止/重启时丢弃迟到响应
          if (epoch !== pollEpochRef.current) return;

          if (result.status === ORDER_STATUS.PAID) {
            stopPolling();
            callbacksRef.current.onPaid(orderNo);
          } else if (TERMINAL_STATUSES.has(result.status)) {
            stopPolling();
            callbacksRef.current.onFailed(orderNo);
          }
        } catch {
          // 网络抖动时静默重试，直至超时
        }

        if (attempts >= maxAttempts) {
          stopPolling();
          callbacksRef.current.onTimeout(orderNo);
        }
      }, intervalMs);
    },
    [intervalMs, maxAttempts, stopPolling],
  );

  return { startPolling, stopPolling };
}
