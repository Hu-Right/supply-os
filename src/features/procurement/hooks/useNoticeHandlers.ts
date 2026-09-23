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
import { ApiError, clearApiCache } from "@/core/http";
import type { NoticeItem } from "../types";
import { viewNotice, unlockNotice, expressInterest } from "../api";
import type { UseNoticeMembershipReturn } from "./useNoticeMembership";
import type { UseNoticeUnlockReturn } from "./useNoticeUnlock";

export interface UseNoticeHandlersOptions {
  /** 当前登录用户 key */
  userId: number | undefined;
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
  /** 未登录时的回调（弹出登录） */
  onRequireLogin: () => void;
  setActionMessage: (message: string) => void;
}

export interface UseNoticeHandlersReturn {
  openNotice: (notice: NoticeItem) => Promise<void>;
  handleUnlockNotice: (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => Promise<boolean>;
  handleExpressInterest: (notice: NoticeItem, interestType: "interested" | "subscribed") => Promise<void>;
}

export function useNoticeHandlers({
  userId,
  setSelectedNotice,
  trackClick,
  trackDetailOpen,
  membership,
  unlock,
  onRequireLogin,
  setActionMessage,
}: UseNoticeHandlersOptions): UseNoticeHandlersReturn {
  const { t } = useLocale();
  const { canUsePaidQuota, refreshMembership } = membership;
  const { isUnlocked, markUnlocked, loadNoticeDetail, loadNoticePreview, loadNoticeContent, setDetailLoadingId } = unlock;

  const openNotice = useCallback(async (notice: NoticeItem) => {
    if (!userId) {
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
    // 确保详情页原文与译文（翻译 API 使用全文）长度一致，"查看原文"开关有意义。
    // 仅解锁态发起：/content 自 2026-09-05 起属付费墙闸口（ARCH-P0），锁定态发起必 403；
    // 解锁成功后全文由 loadNoticeDetail 的 detail 载荷合并，无需在此补发。
    if (alreadyUnlocked || notice.core_locked === false) loadNoticeContent(notice);
    // P2-2：useCallback 稳定引用（上游依赖均已 useCallback 化），
    // NoticeCard 的 React.memo 不再被每次渲染重建的 openNotice 击穿
  }, [
    userId,
    onRequireLogin, trackClick, trackDetailOpen,
    isUnlocked, setSelectedNotice, setActionMessage,
    setDetailLoadingId, refreshMembership, loadNoticeDetail, loadNoticePreview, loadNoticeContent,
  ]);

  const handleUnlockNotice = async (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => {
    if (!userId) {
      onRequireLogin();
      return false;
    }

    // 免费试用已移除：无显式类型时一律走订阅配额，配额不足由服务端 402 拦截
    if (!unlockType && !canUsePaidQuota) {
      setActionMessage(t("procurement_paidQuotaRequired"));
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
    if (!userId) {
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
  };

  return { openNotice, handleUnlockNotice, handleExpressInterest };
}
