/**
 * 上拉加载更多 Hook
 * Infinite Scroll Hook
 *
 * @module shared/ui/useInfiniteScroll
 * @description 基于 IntersectionObserver 的无限滚动加载钩子。
 *              当哨兵元素进入视口时自动触发加载回调。
 *              IntersectionObserver-based infinite scroll hook.
 *              Triggers load callback when sentinel enters viewport.
 */
import { useEffect, useRef } from "react";

interface UseInfiniteScrollOptions {
  /** 是否启用（通常在移动端启用，桌面端用分页） */
  enabled: boolean;
  /** 是否正在加载 */
  loading: boolean;
  /** 是否还有更多数据 */
  hasMore: boolean;
  /** 加载下一页回调 */
  onLoadMore: () => void;
}

/**
 * 上拉加载更多钩子
 * 返回 sentinelRef，绑定到一个不可见的哨兵元素即可
 */
export function useInfiniteScroll({
  enabled,
  loading,
  hasMore,
  onLoadMore,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onLoadMore);
  callbackRef.current = onLoadMore;

  useEffect(() => {
    if (!enabled || loading || !hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callbackRef.current();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, loading, hasMore]);

  return sentinelRef;
}
