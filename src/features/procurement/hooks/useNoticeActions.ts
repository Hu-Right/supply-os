/**
 * 公告详情与支付动作 Hook
 * Notice Detail & Payment Actions Hook
 *
 * @module features/procurement/hooks/useNoticeActions
 * @description 采购详情页的会员配额、解锁集合、详情加载、付费墙/订单编排
 *              （内嵌 useNoticePayment）、打开/解锁/意向等动作处理器，以及
 *              支付回跳对账。路由级 selectedNotice 由 Page 持有并经
 *              setSelectedNotice 注入，避免与搜索/偏好 hook 循环依赖。
 *              Membership quota, unlocked set, detail loading, paywall/order
 *              orchestration (embeds useNoticePayment), open/unlock/interest
 *              action handlers and payment-return reconciliation.
 */
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { ApiError } from "@/core/http";
import { getOrderStatus, type OrderInfo } from "@/features/payment";
import type { NoticeItem, MembershipPlan, MembershipStatus } from "../types";
import {
  fetchMembershipPlans,
  fetchMembershipStatus,
  viewNotice,
  unlockNotice,
  expressInterest,
  fetchNoticeDetail,
  fetchUnlockedNoticeIds,
} from "../api";
import { useNoticePayment, type PanelProvider } from "./useNoticePayment";

// 免费详情查看配额的兜底值（membership 未加载时使用）；
// 真实配额以后端 membership.free_quota 为准（源自 crm_membership_plans 表）
const FREE_QUOTA_FALLBACK = 3;

export interface UseNoticeActionsOptions {
  /** 当前登录用户 key */
  userKey: string | undefined;
  /** 是否 VIP（决定免费配额门槛与解锁类型） */
  isVip: boolean;
  /** 当前列表数据（openNoticeById 复用列表内已有项） */
  items: NoticeItem[];
  /** 选中详情设置器（Page 持有 selectedNotice，函数式更新合并拓展详情） */
  setSelectedNotice: Dispatch<SetStateAction<NoticeItem | null>>;
  /** T-B9 点击埋点（useNoticeFeedback） */
  trackClick: (noticeId: number) => void;
  /** T-C7 详情打开埋点（useNoticeFeedback） */
  trackDetailOpen: (noticeId: number) => void;
}

export interface UseNoticeActionsReturn {
  membership: MembershipStatus | null;
  paidPlans: MembershipPlan[];
  actionMessage: string;
  paidRemaining: number;
  freeRemaining: number;
  freeQuota: number;
  canUsePaidQuota: boolean;
  detailLoadingId: number | null;
  setDetailLoadingId: Dispatch<SetStateAction<number | null>>;
  openNotice: (notice: NoticeItem) => Promise<void>;
  openNoticeById: (id: number) => Promise<void>;
  handlePayUnlock: (notice: NoticeItem) => void;
  handleUnlockNotice: (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => Promise<boolean>;
  handleExpressInterest: (notice: NoticeItem, interestType: "interested" | "subscribed") => Promise<void>;
  refreshMembership: (useCache?: boolean) => Promise<void>;
  // 付费面板状态（useNoticePayment 透传，供详情页 JSX 编排）
  paywallNotice: NoticeItem | null;
  paymentOrder: OrderInfo | null;
  paymentProvider: PanelProvider;
  busyPlanCode: string;
  paymentMessage: string;
  setPaymentProvider: (provider: PanelProvider) => void;
  closePaywall: () => void;
  createNoticeOrder: (planCode: string) => Promise<void>;
  markPaid: () => Promise<void>;
}

export function useNoticeActions(options: UseNoticeActionsOptions): UseNoticeActionsReturn {
  const { userKey, isVip, items, setSelectedNotice, trackClick, trackDetailOpen } = options;
  const { t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();

  const onRequireLogin = () => {
    emitAppEvent("supply-os:require-login");
  };

  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paidPlans, setPaidPlans] = useState<MembershipPlan[]>([]);
  const [actionMessage, setActionMessage] = useState("");

  // 已解锁公告 id 集合 + 详情拓展加载态（闪烁修复）
  // detailLoadingId 记录"正在为哪条公告加载"：快速连续点击时 A 的 finally 不会误清 B 的加载态
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set());
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const markUnlocked = (id: number) =>
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const paidRemaining = Number(membership?.paid_quota_remaining || 0);
  const freeRemaining = Number(membership?.free_remaining ?? FREE_QUOTA_FALLBACK);
  const freeQuota = Number(membership?.free_quota ?? FREE_QUOTA_FALLBACK);
  const canUsePaidQuota = isVip || paidRemaining > 0;

  const getDetailViewCountKey = () => `procurement_detail_views_${userKey || "guest"}`;
  const getDetailViewCount = () => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(getDetailViewCountKey()) || 0);
  };
  const setDetailViewCount = (count: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getDetailViewCountKey(), String(count));
  };

  const refreshMembership = async (useCache = false) => {
    if (!userKey) {
      setMembership(null);
      return;
    }
    try {
      const data = await fetchMembershipStatus(userKey, useCache);
      setMembership(data);
    } catch {
      setMembership(null);
    }
  };

  // 登录后预取已解锁集合：详情首帧据此决定骨架屏还是锁定面板
  useEffect(() => {
    if (!userKey) {
      setUnlockedIds(new Set());
      return;
    }
    let cancelled = false;
    fetchUnlockedNoticeIds(userKey).then((ids) => {
      if (!cancelled) setUnlockedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  // 拉取已解锁公告的拓展详情并合并进当前选中项
  const loadNoticeDetail = async (notice: NoticeItem) => {
    if (!userKey) {
      setDetailLoadingId(null);
      return;
    }
    try {
      const detail = await fetchNoticeDetail(notice.id, userKey);
      setSelectedNotice((prev) => (prev && prev.id === notice.id ? { ...prev, ...detail } : prev));
      markUnlocked(notice.id);
    } catch {
      // 未解锁或加载失败：保留列表数据，不阻断详情页
    } finally {
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
    }
  };

  // 采购详情内嵌多套餐付费面板状态：付费墙 / 订单 / 轮询对账，对齐远端 PaymentPanel
  const {
    paywallNotice,
    paymentOrder,
    paymentProvider,
    busyPlanCode,
    paymentMessage,
    setPaymentProvider,
    openPaywall,
    closePaywall,
    createNoticeOrder,
    markPaid,
  } = useNoticePayment({
    userKey,
    onRequireLogin,
    onPaid: async (noticeId, planCode) => {
      const unlockType = planCode.includes("single") ? "single" : "subscription";
      // 支付成功后详情拉取期间同样以骨架屏过渡
      setDetailLoadingId(noticeId);
      try {
        await unlockNotice(noticeId, userKey || "", unlockType, unlockType === "single" ? 89 : 0);
      } catch {
        // 支付回调可能已在服务端完成解锁，忽略此处失败
      }
      await refreshMembership();
      await loadNoticeDetail({ id: noticeId } as NoticeItem);
      setActionMessage(t("procurement_paidUnlockOk"));
    },
  });

  useEffect(() => {
    fetchMembershipPlans()
      .then((plans) => setPaidPlans(Array.isArray(plans) ? plans : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMembership(true);
  }, [userKey, isVip]);

  const openNotice = async (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    // T-B9 点击埋点：仅推荐模式上报（正反馈联动兴趣码权重，D.7）
    trackClick(notice.id);

    const currentViews = getDetailViewCount();
    const alreadyUnlocked = unlockedIds.has(notice.id);
    // 门槛与后端配额同源：freeQuota 来自 membership.free_quota（DB 单一数据源）
    if (!isVip && !alreadyUnlocked && currentViews >= freeQuota) {
      setSelectedNotice(notice);
      setActionMessage(t("procurement_freeLimit", { count: freeQuota }));
      openPaywall(notice);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // T-C7：详情真实打开（过付费墙拦截后）才计隐式信号——会话内回看 +0.5；记录进入时刻供退出结算
    trackDetailOpen(notice.id);

    // 三请求并行：浏览计数与配额刷新不再阻塞详情数据到达
    void viewNotice(notice.id, userKey);
    if (!isVip && !alreadyUnlocked) setDetailViewCount(currentViews + 1);
    setDetailLoadingId(alreadyUnlocked ? notice.id : null);
    setSelectedNotice(notice);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    void refreshMembership();
    void loadNoticeDetail(notice);
  };

  // 按 id 打开公告详情（列表内已有则复用，否则以最小对象占位再合并拓展详情）
  const openNoticeById = async (id: number) => {
    const base = items.find((it) => it.id === id) || ({ id } as NoticeItem);
    setDetailLoadingId(id);
    setSelectedNotice(base);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    await loadNoticeDetail(base);
  };

  // 单条公告付费买断：派发真实支付事件（携带 notice_id + 回跳地址）
  const handlePayUnlock = (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }
    emitAppEvent("supply-os:pay", {
      code: "single_89",
      name: t("procurement_singleUnlockName"),
      price: 89,
      currency: "CNY",
      noticeId: notice.id,
      returnUrl: `${window.location.origin}/procurement`,
    });
  };

  // 支付整页跳回后的对账：?order_no=&trade_no=&notice_id= 或仅 ?notice_id=
  useEffect(() => {
    const orderNo = searchParams.get("order_no");
    const noticeIdParam = searchParams.get("notice_id");
    const tradeNo = searchParams.get("trade_no") || undefined;
    if (!orderNo && !noticeIdParam) return;
    let cancelled = false;
    (async () => {
      if (orderNo) {
        try {
          const status = await getOrderStatus(orderNo, tradeNo);
          if (cancelled) return;
          if (status.status === "paid") {
            setActionMessage(t("procurement_paymentReturnPaid"));
            await refreshMembership();
            const nid = status.notice_id ?? (noticeIdParam ? Number(noticeIdParam) : null);
            if (nid) await openNoticeById(nid);
          } else {
            setActionMessage(t("procurement_paymentReturnPending"));
          }
        } catch {
          if (!cancelled) setActionMessage(t("procurement_paymentReturnFailed"));
        }
      } else if (noticeIdParam) {
        await openNoticeById(Number(noticeIdParam));
      }
      if (!cancelled) setSearchParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleUnlockNotice = async (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => {
    if (!userKey) {
      onRequireLogin();
      return false;
    }

    if (!unlockType && !canUsePaidQuota && freeRemaining <= 0) {
      setActionMessage(t("procurement_freeLimit", { count: freeQuota }));
      openPaywall(notice);
      return false;
    }

    const nextUnlockType = unlockType || (freeRemaining > 0 ? "free" : "subscription");
    // 解锁发起即进入加载态：锁定面板让位于骨架屏，直至详情返回
    setDetailLoadingId(notice.id);
    try {
      await unlockNotice(notice.id, userKey, nextUnlockType, nextUnlockType === "single" ? 89 : 0);
    } catch (err) {
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
      if (err instanceof ApiError && err.status === 402) {
        setActionMessage(t("procurement_freeLimit", { count: freeQuota }));
        openPaywall(notice);
      } else {
        setActionMessage(t("procurement_unlockFail"));
      }
      await refreshMembership();
      return false;
    }

    await refreshMembership();
    markUnlocked(notice.id);
    setActionMessage(nextUnlockType === "free" ? t("procurement_freeUnlockOk") : t("procurement_paidUnlockOk"));
    // 解锁成功后拉取拓展详情，实时补全联系人/文件等信息
    await loadNoticeDetail(notice);
    return true;
  };

  const handleExpressInterest = async (notice: NoticeItem, interestType: "interested" | "subscribed") => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    try {
      await expressInterest(notice.id, userKey, interestType);
    } catch {
      setActionMessage("Action failed. Please try again later.");
      return;
    }

    setActionMessage(interestType === "subscribed" ? t("procurement_subscribedSuccess") : t("procurement_actionSuccess"));
    await refreshMembership();
    openPaywall(notice);
  };

  return {
    membership,
    paidPlans,
    actionMessage,
    paidRemaining,
    freeRemaining,
    freeQuota,
    canUsePaidQuota,
    detailLoadingId,
    setDetailLoadingId,
    openNotice,
    openNoticeById,
    handlePayUnlock,
    handleUnlockNotice,
    handleExpressInterest,
    refreshMembership,
    paywallNotice,
    paymentOrder,
    paymentProvider,
    busyPlanCode,
    paymentMessage,
    setPaymentProvider,
    closePaywall,
    createNoticeOrder,
    markPaid,
  };
}
