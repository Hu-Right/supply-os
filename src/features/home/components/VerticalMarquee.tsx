/**
 * 垂直无缝滚动组件 — 瀑布流自动向上滚动 + 悬停暂停
 * Vertical Marquee — Seamless infinite upward scroll + hover-pause
 *
 * @module features/home/components/VerticalMarquee
 * @description 通用垂直无缝滚动容器。将内容列表渲染两份，通过
 *              requestAnimationFrame + CSS translateY 实现 GPU 加速的
 *              无限循环向上滚动，鼠标悬停时暂停、移开后从断点继续。
 */
import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VerticalMarqueeProps<T> {
  /** 滚动数据列表 */
  items: T[];
  /** 自定义渲染每一项 */
  renderItem: (item: T, index: number) => ReactNode;
  /** 滚动速度：像素/秒，默认 40 */
  speed?: number;
  /** 可视区域最大高度（CSS 值），超出部分隐藏并滚动 */
  maxHeight?: number | string;
  /** 加载态骨架屏 */
  loading?: boolean;
  /** 骨架屏行数 */
  skeletonRows?: number;
  /** 空态 / 错误态文案 */
  emptyText?: string;
  /** 外层容器额外 className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VerticalMarquee<T>({
  items,
  renderItem,
  speed = 40,
  maxHeight,
  loading = false,
  skeletonRows = 3,
  emptyText = "暂无数据",
  className,
}: VerticalMarqueeProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const contentHeightRef = useRef(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  /* ---- 检测 prefers-reduced-motion ---- */
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const count = items.length;
  const hasItems = count > 0 && !loading;
  const shouldAnimate = hasItems && count > 1 && !prefersReducedMotion;

  /* ---- 测量单份内容高度 ---- */
  const measureContent = useCallback(() => {
    if (!containerRef.current) return;
    const children = containerRef.current.children;
    // children[0] = 第一份内容的包裹 div，其高度即为一个完整循环的高度
    if (children[0]) {
      contentHeightRef.current = (children[0] as HTMLElement).offsetHeight;
    }
  }, []);

  /* ---- rAF 动画循环 ---- */
  const animate = useCallback(
    (timestamp: number) => {
      if (pausedRef.current) {
        lastTimeRef.current = null;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      offsetRef.current += speed * delta;

      // 当偏移量达到单份内容高度时，无缝重置（视觉上完全一致）
      if (contentHeightRef.current > 0 && offsetRef.current >= contentHeightRef.current) {
        offsetRef.current -= contentHeightRef.current;
      }

      if (containerRef.current) {
        containerRef.current.style.transform = `translateY(-${offsetRef.current}px)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    },
    [speed],
  );

  /* ---- 启动 / 清理动画 ---- */
  useEffect(() => {
    if (!shouldAnimate) return;

    // 等一帧让 DOM 渲染完毕后再测量
    const measureFrame = requestAnimationFrame(() => {
      measureContent();
      rafRef.current = requestAnimationFrame(animate);
    });

    return () => {
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(rafRef.current);
    };
  }, [shouldAnimate, animate, measureContent]);

  /* ---- 悬停暂停 ---- */
  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
  }, []);

  /* ---- 骨架屏 ---- */
  if (loading) {
    return (
      <div className={`space-y-4 ${className ?? ""}`} aria-busy="true">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  /* ---- 空态 / 错误态 ---- */
  if (!hasItems) {
    return (
      <div className={`text-center py-8 text-sm text-slate-400 ${className ?? ""}`}>
        {emptyText}
      </div>
    );
  }

  /* ---- 单项不滚动，直接渲染 ---- */
  if (count === 1 || prefersReducedMotion) {
    return (
      <div className={className}>
        {items.map((item, idx) => (
          <div key={idx}>{renderItem(item, idx)}</div>
        ))}
      </div>
    );
  }

  /* ---- 渲染一份内容的辅助函数（所有项包裹在单个 div 中，确保高度测量正确） ---- */
  const renderOneSet = (keyPrefix: string) => (
    <div data-set={keyPrefix}>
      {items.map((item, idx) => (
        <div key={`${keyPrefix}-${idx}`}>{renderItem(item, idx)}</div>
      ))}
    </div>
  );

  /* ---- 可视窗口内联样式（限制高度，超出滚动） ---- */
  const viewportStyle = maxHeight
    ? { maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight } as const
    : undefined;

  return (
    <div
      className={`overflow-hidden ${className ?? ""}`}
      style={viewportStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-live="polite"
    >
      {/* 两份相同内容实现无缝循环：第一份滚出视口时，第二份恰好接替 */}
      <div ref={containerRef} style={{ willChange: "transform" }}>
        {renderOneSet("a")}
        {renderOneSet("b")}
      </div>
    </div>
  );
}
