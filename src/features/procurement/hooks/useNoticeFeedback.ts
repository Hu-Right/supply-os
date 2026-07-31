/**
 * 推荐反馈采集 Hook
 * Notice Feedback Hook
 *
 * @module features/procurement/hooks/useNoticeFeedback
 * @description T-B9 显式反馈（曝光/点击）与 T-C7 隐式偏好信号
 *              （dwell/scroll_end/quick_exit/revisit）的门控、采集与批量上报。
 *              仅推荐模式采集，避免污染搜索/筛选场景的反馈数据。
 *              Explicit feedback (impression/click) and implicit preference
 *              signals (dwell/scroll_end/quick_exit/revisit) gating, collection
 *              and batch reporting, recommended mode only.
 */
import { useEffect, useRef } from "react";
import type { NoticeItem, PrefsMode } from "../types";
import { sendNoticeFeedback } from "../api";

export interface UseNoticeFeedbackOptions {
  /** 当前登录用户 key（未登录不采集） */
  userKey: string | undefined;
  /** 自动筛选模式（仅推荐模式采集反馈） */
  prefsMode: PrefsMode;
  /** 是否有生效搜索条件（搜索场景不采集） */
  hasSearch: boolean;
  /** 当前排序（仅默认 deadline 排序采集） */
  activeSort: "deadline" | "latest";
  /** 当前选中的详情公告（scroll_end 信号依赖详情页打开） */
  selectedNotice: NoticeItem | null;
  /** 推荐响应 A/B 桶标记 ref（列表加载时写入，反馈埋点读取，T-B10） */
  variantRef: { current: string | undefined };
}

export interface UseNoticeFeedbackReturn {
  /** 反馈采集总开关（登录 + 推荐模式 + 无搜索 + deadline 排序） */
  feedbackEnabled: boolean;
  /** NoticeCard 根节点挂载/卸载回调（曝光采集） */
  observeCard: (el: HTMLElement | null, noticeId: number) => void;
  /** 详情退出结算（dwell / quick_exit，返回列表时调用） */
  reportDetailExit: () => void;
  /** 点击埋点（仅推荐模式，T-B9） */
  trackClick: (noticeId: number) => void;
  /** 详情打开埋点（会话内回看 revisit + 记录进入时刻，T-C7） */
  trackDetailOpen: (noticeId: number) => void;
}

export function useNoticeFeedback(options: UseNoticeFeedbackOptions): UseNoticeFeedbackReturn {
  const { userKey, prefsMode, hasSearch, activeSort, selectedNotice, variantRef } = options;

  // ── T-B9 推荐反馈采集（本地差异 #13：D.7 前端侧）──
  // 仅推荐模式采集曝光/点击/dismiss/收藏，避免污染搜索/筛选场景的反馈数据
  const feedbackEnabled = Boolean(userKey) && prefsMode === "recommended" && !hasSearch && activeSort === "deadline";
  // [dismiss/収藏功能临时禁用 2026-07-30] favoritedIds 已移除
  // const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());
  // 曝光去重：本地 Set 记录已上报卡片（同 session 同卡只报一次；服务端唯一键幂等兜底）
  const impressionReportedRef = useRef<Set<number>>(new Set());
  const impressionPendingRef = useRef<number[]>([]);
  const impressionTimerRef = useRef<number | null>(null);
  const cardElsRef = useRef<Map<number, Element>>(new Map());
  const observedIdsRef = useRef<Map<Element, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const userKeyRef = useRef(userKey);
  userKeyRef.current = userKey;

  // ── T-C7 隐式偏好信号（本地差异 #16：C.3.6）──
  // 详情停留（dwell>30s）/ 滚动到底（scroll_end）/ 秒退（quick_exit）/ 会话内回看（revisit）。
  // 与显式反馈同门控 feedbackEnabled（仅推荐模式），同表同 ENUM 由 action 区分
  const detailEnterRef = useRef<{ id: number; ts: number } | null>(null);
  const visitedDetailIdsRef = useRef<Set<number>>(new Set());
  const scrollEndReportedRef = useRef<Set<number>>(new Set());

  // 待上报曝光短暂聚合后批量发送（≤50 条与服务端一致）
  const flushImpressions = () => {
    impressionTimerRef.current = null;
    const key = userKeyRef.current;
    const batch = impressionPendingRef.current.splice(0, 50);
    if (key && batch.length) {
      void sendNoticeFeedback(key, batch.map((id) => ({ notice_id: id, action: "impression" as const, variant: variantRef.current })));
    }
  };

  const getImpressionObserver = () => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = observedIdsRef.current.get(entry.target);
            if (!id || impressionReportedRef.current.has(id)) return;
            impressionReportedRef.current.add(id);
            impressionPendingRef.current.push(id);
            observerRef.current?.unobserve(entry.target);
          });
          if (impressionPendingRef.current.length && impressionTimerRef.current === null) {
            impressionTimerRef.current = window.setTimeout(flushImpressions, 500);
          }
        },
        { threshold: 0.5 }
      );
    }
    return observerRef.current;
  };

  // NoticeCard 根节点挂载/卸载回调：挂载即观察，卸载解除观察
  const observeCard = (el: HTMLElement | null, noticeId: number) => {
    const prev = cardElsRef.current.get(noticeId);
    if (prev && prev !== el) {
      observerRef.current?.unobserve(prev);
      observedIdsRef.current.delete(prev);
    }
    if (el) {
      cardElsRef.current.set(noticeId, el);
      observedIdsRef.current.set(el, noticeId);
      if (!impressionReportedRef.current.has(noticeId)) getImpressionObserver().observe(el);
    } else {
      cardElsRef.current.delete(noticeId);
    }
  };

  // 卸载清理：断开观察器、冲掉未上报的曝光批次
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      if (impressionTimerRef.current !== null) {
        window.clearTimeout(impressionTimerRef.current);
        flushImpressions();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // [dismiss 功能临时禁用 2026-07-30] handleDismissNotice 已移除
  // const handleDismissNotice = async (notice: NoticeItem) => { ... };

  // [収藏功能临时禁用 2026-07-30] handleFavoriteNotice 已移除
  // const handleFavoriteNotice = (notice: NoticeItem) => { ... };

  // T-B9 点击埋点：仅推荐模式上报（正反馈联动兴趣码权重，D.7）
  const trackClick = (noticeId: number) => {
    const key = userKeyRef.current;
    if (feedbackEnabled && key) {
      void sendNoticeFeedback(key, [{ notice_id: noticeId, action: "click", variant: variantRef.current }]);
    }
  };

  // T-C7：详情真实打开（过付费墙拦截后）才计隐式信号——会话内回看 +0.5；记录进入时刻供退出结算
  const trackDetailOpen = (noticeId: number) => {
    if (!feedbackEnabled) return;
    const key = userKeyRef.current;
    if (visitedDetailIdsRef.current.has(noticeId)) {
      if (key) void sendNoticeFeedback(key, [{ notice_id: noticeId, action: "revisit", variant: variantRef.current }]);
    } else {
      visitedDetailIdsRef.current.add(noticeId);
    }
    detailEnterRef.current = { id: noticeId, ts: Date.now() };
  };

  // T-C7：详情退出结算——停留 >30s 上报 dwell（携带 dwell_ms）；<3s 上报 quick_exit（轻负反馈，
  // 服务端 ×0.95 衰减带 0.01 下限保护）；中间区间不产生信号
  const reportDetailExit = () => {
    const enter = detailEnterRef.current;
    detailEnterRef.current = null;
    if (!enter || !feedbackEnabled || !userKey) return;
    const dwellMs = Date.now() - enter.ts;
    if (dwellMs > 30000) {
      void sendNoticeFeedback(userKey, [{ notice_id: enter.id, action: "dwell", dwell_ms: dwellMs, variant: variantRef.current }]);
    } else if (dwellMs < 3000) {
      void sendNoticeFeedback(userKey, [{ notice_id: enter.id, action: "quick_exit", dwell_ms: dwellMs, variant: variantRef.current }]);
    }
  };

  // T-C7：详情滚动到底 +0.1（NoticeDetail 为整页布局，监听 window 滚动；每卡每会话只报一次）
  useEffect(() => {
    if (!selectedNotice || !feedbackEnabled || !userKey) return;
    const noticeId = selectedNotice.id;
    const onScroll = () => {
      if (scrollEndReportedRef.current.has(noticeId)) return;
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 60) return;
      scrollEndReportedRef.current.add(noticeId);
      void sendNoticeFeedback(userKey, [{ notice_id: noticeId, action: "scroll_end", variant: variantRef.current }]);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [selectedNotice, feedbackEnabled, userKey]);

  return {
    feedbackEnabled,
    observeCard,
    reportDetailExit,
    trackClick,
    trackDetailOpen,
  };
}
