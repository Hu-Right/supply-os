/**
 * 验证码倒计时 hook（架构评估 C1：收编逐字重复的倒计时 effect）
 *
 * @module shared/hooks/useCountdown
 * @description 原 usePhoneBinding/useEmailBinding 各持有一份相同的
 *              countdown state + setTimeout 递减 effect，收编为单一实现。
 *
 * 用法：
 *   const { countdown, start, reset } = useCountdown();
 *   start(60);   // 发送验证码后开始 60s 倒计时
 *   reset();     // 绑定/解绑完成后归零
 */
import { useCallback, useEffect, useState } from "react";

export function useCountdown(initial = 0) {
  const [countdown, setCountdown] = useState(initial);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const start = useCallback((seconds: number) => setCountdown(seconds), []);
  const reset = useCallback(() => setCountdown(0), []);

  return { countdown, start, reset };
}
