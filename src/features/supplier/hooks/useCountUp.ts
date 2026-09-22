/**
 * 数字跳动动画 Hook
 * Count-up Animation Hook
 *
 * @module features/supplier/hooks/useCountUp
 * @description 从 0 缓动到目标数字，easeOutQuart 曲线。
 */
import { useState, useEffect } from "react";

/** 数字跳动动画 — easeOutQuart 缓动到 target */
export function useCountUp(target: number, duration = 1500): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      start = Math.floor(eased * target);
      setCount(start);
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}
