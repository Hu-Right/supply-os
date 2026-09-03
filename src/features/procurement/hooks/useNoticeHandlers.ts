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
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { ApiError, clearApiCache } from "@/core/http";
import type { NoticeItem } from "../types";
import { viewNotice, unlockNotice, expressInterest } from "../api";
import type { UseNoticeMembershipReturn } from "./useNoticeMembership";
import type { UseNoticeUnlockReturn } from "./useNoticeUnlock";

export interface UseNoticeHandlersOptions {
  /** 当前登录用户 key */
  userKey: number | undefined;
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
  const { canUsePaidQuota, refreshMembership } = membership;
  const { isUnlocked, markUnlocked, loadNoticeDetail, loadNoticePreview, loadNoticeContent, setDetailLoadingId } = unlock;

  const openNotice = useCallback(async (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    // T-B9 点击埋点：仅推荐模式上报（正反馈联动兴趣码权重，D.7）
    trackClick(notice.id);

    const alreadyUnlocked = isUnlocked(notice.id);
    // 免费试用已移除（2026-08-30）：未解锁用户打开详情由服务端 403 core_locked
    // 付费墙接管（本地 localStorage 计数门槛已删除），此处不再前置拦截

    // T-C7：详情真实打开（过付费墙拦截后）才计隐式信号——会话内回看 +0.5；记录进入时刻供退出结算
    trackDetailOpen(notice.id);

    // 三请求并行：浏览计数与配额刷新不再阻塞详情数据到达
    void viewNotice(notice.id);
    setDetailLoadingId(alreadyUnlocked ? notice.id : null);
    setSelectedNotice(notice);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    void refreshMembership();
    void loadNoticeDetail(notice);
    // 锁定态渐进式预览：并行拉取机构名/分类标签等有限预览字段（无敏感数据）
    if (!alreadyUnlocked) void loadNoticePreview(notice);
    // 全文内容加载：搜索 SQL 截断 description 为 300 字符，本请求替换为完整原文，
    // 确保详情页原文与译文（翻译 API 使用全文）长度一致，"查看原文"开关有意义
    loadNoticeContent(notice);
    // P2-2：useCallback 稳定引用（上游依赖均已 useCallback 化），
    // NoticeCard 的 React.memo 不再被每次渲染重建的 openNotice 击穿
  }, [
    userKey, isVip, t,
    onRequireLogin, trackClick, trackDetailOpen,
    isUnlocked, setSelectedNotice, setActionMessage, openPaywall,
    setDetailLoadingId, refreshMembership, loadNoticeDetail, loadNoticePreview, loadNoticeContent,
  ]);

  // 单条公告付费买断：派发真实支付事件（携带 notice_id + 回跳地址）
  const handlePayUnlock = async (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }
    // P1-10 安全修复：套餐码与价格从后端在售套餐动态获取，不再硬编码——
    // 套餐上下架/调价时无需发版；single_99 首单价仅在用户具备资格时选用
    // （服务端 plans 接口附 first_purchase_eligible），否则回退标准 single_199
    const plans = await membership.loadPaidPlans();
    const singleFirst = plans.find((p) => p.plan_code === "single_99");
    const singleStandard = plans.find((p) => p.plan_code === "single_199" && p.plan_type === "single");
    const singlePlan = singleFirst?.first_purchase_eligible === true ? singleFirst : singleStandard;
    emitAppEvent("supply-os:pay", {
      code: singlePlan?.plan_code || "single_199",
      name: t("procurement_singleUnlockName"),
      price: Number(singlePlan?.price ?? 199),
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

    // 免费试用已移除：无显式类型时一律走订阅配额，配额不足由服务端 402 拦截
    if (!unlockType && !canUsePaidQuota) {
      setActionMessage(t("procurement_paidQuotaRequired"));
      openPaywall(notice);
      return false;
    }

    const nextUnlockType = unlockType || "subscription";
    // 解锁发起即进入加载态：锁定面板让位于骨架屏，直至详情返回
    setDetailLoadingId(notice.id);
    try {
      // P2-10：价格由服务端按套餐定价，前端固定传 0
      await unlockNotice(notice.id, nextUnlockType, 0);
    } catch (err) {
      setDetailLoadingId((prev) => (prev === notice.id ? null : prev));
      if (err instanceof ApiError && err.status === 402) {
        setActionMessage(t("procurement_paidQuotaRequired"));
        openPaywall(notice);
      } else {
        setActionMessage(t("procurement_unlockFail"));
      }
      await refreshMembership();
      return false;
    }

    await refreshMembership();
    markUnlocked(notice.id);
    // P2-5 安全修复：解锁成功后清除解锁历史缓存，确保 RecentUnlocks 立即刷新
    clearApiCache("/api/payment/unlocks");
    setActionMessage(t("procurement_paidUnlockOk"));
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
      await expressInterest(notice.id, interestType);
    } catch {
      setActionMessage(t("procurement_actionFailed"));
      return;
    }

    setActionMessage(interestType === "subscribed" ? t("procurement_subscribedSuccess") : t("procurement_actionSuccess"));
    await refreshMembership();
    openPaywall(notice);
  };

  return { openNotice, handlePayUnlock, handleUnlockNotice, handleExpressInterest };
}
