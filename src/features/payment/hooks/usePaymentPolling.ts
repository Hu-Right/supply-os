/**
 * 支付订单轮询 Hook
 * Payment Order Polling Hook
 *
 * @module features/payment/hooks/usePaymentPolling
 * @description 从 PaymentModalCore 提取的轮询状态机，
 *              支持统一上限、指数退避、成功/失败回调。
 *              会员支付与研修班支付共用此 Hook。
 */

import { useState, useCallback, useRef, useEffect } from "react";

export type PollStatus = "idle" | "polling" | "paid" | "failed" | "timeout";

export interface UsePaymentPollingOptions {
  /** 查询订单状态的异步函数 */
  queryStatus: (orderNo: string) => Promise<{ status: string }>;
  /** 轮询间隔（毫秒），默认 3000 */
  intervalMs?: number;
  /** 最大轮询次数，默认 200 */
  maxAttempts?: number;
  /** 支付成功回调 */
  onSuccess?: (orderNo: string) => void;
  /** 失败/超时回调 */
  onFailed?: (orderNo: string) => void;
}

export interface UsePaymentPollingReturn {
  /** 当前轮询状态 */
  status: PollStatus;
  /** 开始轮询指定订单 */
  start: (orderNo: string) => void;
  /** 停止轮询 */
  stop: () => void;
  /** 重置为 idle */
  reset: () => void;
}

export function usePaymentPolling({
  queryStatus,
  intervalMs = 3000,
  maxAttempts = 200,
  onSuccess,
  onFailed,
}: UsePaymentPollingOptions): UsePaymentPollingReturn {
  const [status, setStatus] = useState<PollStatus>("idle");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 组件卸载时自动停止
  useEffect(() => stop, [stop]);

  const start = useCallback(
    (orderNo: string) => {
      stop();
      countRef.current = 0;
      setStatus("polling");

      timerRef.current = setInterval(async () => {
        countRef.current += 1;
        if (countRef.current > maxAttempts) {
          stop();
          setStatus("timeout");
          onFailedRef.current?.(orderNo);
          return;
        }
        try {
          const result = await queryStatus(orderNo);
          if (result.status === "paid") {
            stop();
            setStatus("paid");
            onSuccessRef.current?.(orderNo);
          } else if (
            result.status === "closed" ||
            result.status === "failed" ||
            result.status === "expired"
          ) {
            stop();
            setStatus("failed");
            onFailedRef.current?.(orderNo);
          }
        } catch {
          // 单次轮询失败不中断，继续下一次
        }
      }, intervalMs);
    },
    [queryStatus, intervalMs, maxAttempts, stop],
  );

  const reset = useCallback(() => {
    stop();
    setStatus("idle");
  }, [stop]);

  return { status, start, stop, reset };
}
