/**
 * 数字跳动动画 Hook
 * Count-up Animation Hook
 *
 * @module shared/hooks/useCountUp
 * @description 首帧直接返回目标值（服务端直出的真实数字不会被动画抹成 0），
 *              仅在 target 变化时从「当前显示值」缓动到新目标。
 *              首页 StatsWall、采购页 ListingStatsBar、供应商页统计带共用。
 */
import { useEffect, useRef, useState } from "react";

/** 数字跳动动画 — 首帧即 target，target 变化时 easeOutQuart 过渡 */
export function useCountUp(target: number, duration = 1500): number {
  // 初值 = target：SSR 与 hydration 首帧都渲染真实数字。
  // 旧实现从 0 起步，即使服务端注入了快照，HTML 里也只会输出 0。
  const [count, setCount] = useState(target);
  /** 上一次已渲染的值：新目标到来时从这里开始缓动，避免跳变 */
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      const value = Math.floor(from + (target - from) * eased);
      shownRef.current = value;
      setCount(value);
      if (progress >= 1) {
        shownRef.current = target;
        setCount(target);
        clearInterval(timer);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);

  return count;
}
