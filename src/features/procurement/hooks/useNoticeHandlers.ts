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
  handleUnlockNotice: (notice: NoticeItem, unlockType?: "free" | "subscription") => Promise<boolean>;
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
  const { isUnlocked, markUnlocked, loadNoticeDetail, loadNoticePreview } = unlock;

  const openNotice = useCallback(async (notice: NoticeItem) => {
    if (!userId) {
      onRequireLogin();
      return;
    }

    // T-B9 点击埋点：仅推荐模式上报（正反馈联动兴趣码权重，D.7）
    trackClick(notice.noticePk);

    const alreadyUnlocked = isUnlocked(notice.noticePk);
    // 免费试用已移除（2026-08-30）：未解锁用户打开详情由服务端 403 core_locked
    // 付费墙接管（本地 localStorage 计数门槛已删除），此处不再前置拦截

    // T-C7：详情真实打开（过付费墙拦截后）才计隐式信号——会话内回看 +0.5；记录进入时刻供退出结算
    trackDetailOpen(notice.noticePk);

    // 三请求并行：浏览计数与配额刷新不再阻塞详情数据到达
    void viewNotice(notice.noticePk);
    setSelectedNotice(notice);
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    // 会员状态取缓存版：/membership/status 一次要落 5-6 次库（套餐 + 门控矩阵 + 额度池），
    // 每次点开详情都无缓存重打一枪，在库链路抖动时（本仓 dev 库走 SSH 隧道）足以把首屏拖到十几秒。
    // 打开详情只是「看一眼当前权益」，不需要强一致；解锁/支付路径仍会显式 refreshMembership()
    // 拿最新配额，这里用 TTL 缓存不会让扣费/升级结果延迟生效。
    void refreshMembership(true);
    void loadNoticeDetail(notice);
    // 锁定态渐进式预览：列表项本身已带全部预览字段（标题/编号/买家/截止/金额/发布日期），
    // 只有深链打开时 base 是 { noticePk } 空壳，才需要 /preview 补字段。
    if (!alreadyUnlocked && !notice.title) void loadNoticePreview(notice);
    // 全文不再单独拉：/detail 返回的 description / title / descriptionCn 与 /content 同源
    // （都读 notice_public 整行，只有列表 SQL 才截断 300 字符），详情打开后再打一枪 /content
    // 属纯重复请求——隧道抖动时它还要占一次 5-6 次库的往返。
  }, [
    userId,
    onRequireLogin, trackClick, trackDetailOpen,
    isUnlocked, setSelectedNotice, setActionMessage,
    refreshMembership, loadNoticeDetail, loadNoticePreview,
  ]);

  const handleUnlockNotice = async (notice: NoticeItem, unlockType?: "free" | "subscription") => {
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
    try {
      // P2-10：价格由服务端按套餐定价，前端固定传 0
      await unlockNotice(notice.noticePk, nextUnlockType, 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setActionMessage(t("procurement_paidQuotaRequired"));
      } else {
        setActionMessage(t("procurement_unlockFail"));
      }
      await refreshMembership();
      return false;
    }

    await refreshMembership();
    markUnlocked(notice.noticePk);
    // P2-5 安全修复：解锁成功后清除解锁历史缓存，确保 RecentUnlocks 立即刷新
    clearApiCache("/api/payment/unlocks");
    // 2026-10-29：会员打开公告即自动解锁，解锁不再是用户动作 ⇒ 不再弹「已解锁该商机」成功提示
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
      await expressInterest(notice.noticePk, interestType);
    } catch {
      setActionMessage(t("procurement_actionFailed"));
      return;
    }

    setActionMessage(interestType === "subscribed" ? t("procurement_subscribedSuccess") : t("procurement_actionSuccess"));
    await refreshMembership();
  };

  return { openNotice, handleUnlockNotice, handleExpressInterest };
}

