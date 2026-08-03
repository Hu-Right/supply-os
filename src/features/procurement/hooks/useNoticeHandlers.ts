/**
 * 公告动作处理器 Hook
 * Notice Action Handlers Hook
 *
 * @module features/procurement/hooks/useNoticeHandlers
 * @description 打开详情/免费门槛拦截、付费买断、免费与会员解锁、意向/订阅
 *              等动作处理器；状态来自会员配额、解锁集合与付费面板 hook。
 *              Open/paywall-gate, paid buyout, free/member unlock and
 *              interest/subscribe handlers built on the state hooks.
 */
import type { Dispatch, SetStateAction } from "react";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { ApiError } from "@/core/http";
import type { NoticeItem } from "../types";
import { viewNotice, unlockNotice, expressInterest } from "../api";
import { getDetailViewCount, setDetailViewCount } from "../utils/detailViewCount";
import type { UseNoticeMembershipReturn } from "./useNoticeMembership";
import type { UseNoticeUnlockReturn } from "./useNoticeUnlock";

export interface UseNoticeHandlersOptions {
  /** 当前登录用户 key */
  userKey: string | undefined;
  /** 是否 VIP（决定免费配额门槛与解锁类型） */
  isVip: boolean;
  /** 选中详情设置器（Page 持有 selectedNotice） */
  setSelectedNotice: Dispatch<SetStateAction<NoticeItem | null>>;
  /** T-B9 点击埋点（useNoticeFeedback） */
  trackClick: (noticeId: number) => void;
  /** T-C7 详情打开埋点（useNoticeFeedback） */
  trackDetailOpen: (noticeId: number) => void;
  /** 会员配额状态（useNoticeMembership） */
  membership: UseNoticeMembershipReturn;
  /** 解锁集合与详情加载（useNoticeUnlock） */
  unlock: UseNoticeUnlockReturn;
  /** 打开付费墙（useNoticePayment） */
  openPaywall: (notice: NoticeItem) => void;
  /** 未登录时的回调（弹出登录） */
  onRequireLogin: () => void;
  setActionMessage: (message: string) => void;
}

export interface UseNoticeHandlersReturn {
  openNotice: (notice: NoticeItem) => Promise<void>;
  handlePayUnlock: (notice: NoticeItem) => void;
  handleUnlockNotice: (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => Promise<boolean>;
  handleExpressInterest: (notice: NoticeItem, interestType: "interested" | "subscribed") => Promise<void>;
}

export function useNoticeHandlers({
  userKey,
  isVip,
  setSelectedNotice,
  trackClick,
  trackDetailOpen,
  membership,
  unlock,
  openPaywall,
  onRequireLogin,
  setActionMessage,
}: UseNoticeHandlersOptions): UseNoticeHandlersReturn {
  const { t } = useLocale();
  const { freeQuota, freeRemaining, canUsePaidQuota, refreshMembership } = membership;
  const { isUnlocked, markUnlocked, loadNoticeDetail, setDetailLoadingId } = unlock;

  const openNotice = async (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    // T-B9 点击埋点：仅推荐模式上报（正反馈联动兴趣码权重，D.7）
    trackClick(notice.id);

    const currentViews = getDetailViewCount(userKey);
    const alreadyUnlocked = isUnlocked(notice.id);
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
    if (!isVip && !alreadyUnlocked) setDetailViewCount(userKey, currentViews + 1);
    setDetailLoadingId(alreadyUnlocked ? notice.id : null);
    setSelectedNotice(notice);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    void refreshMembership();
    void loadNoticeDetail(notice);
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

  return { openNotice, handlePayUnlock, handleUnlockNotice, handleExpressInterest };
}
