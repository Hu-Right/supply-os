/**
 * 公告详情与支付动作 Hook
 * Notice Detail & Payment Actions Hook
 *
 * @module features/procurement/hooks/useNoticeActions
 * @description 采购详情页动作编排层：组合会员配额、解锁集合与详情加载、
 *              付费墙/订单、动作处理器与支付回跳对账。路由级
 *              selectedNotice 由 Page 持有并经 setSelectedNotice 注入，
 *              避免与搜索/偏好 hook 循环依赖。
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import type { NoticeItem } from "../types";
import { unlockNotice } from "../api";
import { useNoticePayment } from "./useNoticePayment";
import { useNoticeMembership, type UseNoticeMembershipReturn } from "./useNoticeMembership";
import { useNoticeUnlock, type UseNoticeUnlockReturn } from "./useNoticeUnlock";
import { useNoticeHandlers, type UseNoticeHandlersReturn } from "./useNoticeHandlers";
import { usePaymentReturnReconciliation } from "./usePaymentReturnReconciliation";

export interface UseNoticeActionsOptions {
  userKey: string | undefined; // 当前登录用户 key
  isVip: boolean; // 是否 VIP（决定免费配额门槛与解锁类型）
  items: NoticeItem[]; // 当前列表数据（openNoticeById 复用列表内已有项）
  setSelectedNotice: Dispatch<SetStateAction<NoticeItem | null>>; // Page 持有的选中详情设置器
  trackClick: (noticeId: number) => void; // T-B9 点击埋点（useNoticeFeedback）
  trackDetailOpen: (noticeId: number) => void; // T-C7 详情打开埋点（useNoticeFeedback）
  /** 支付成功后刷新 AuthContext 的 isVip 状态（由 Page 从 useAuth 注入） */
  refreshAuth?: () => Promise<void>;
}

export interface UseNoticeActionsReturn
  extends UseNoticeMembershipReturn,
    UseNoticeUnlockReturn,
    UseNoticeHandlersReturn,
    Omit<ReturnType<typeof useNoticePayment>, "openPaywall"> {
  actionMessage: string;
}

export function useNoticeActions(options: UseNoticeActionsOptions): UseNoticeActionsReturn {
  const { userKey, isVip, items, setSelectedNotice, trackClick, trackDetailOpen, refreshAuth } = options;
  const { t } = useLocale();
  const [actionMessage, setActionMessage] = useState("");

  const onRequireLogin = () => emitAppEvent("supply-os:require-login");

  const membership = useNoticeMembership({ userKey, isVip });
  const unlock = useNoticeUnlock({ userKey, items, setSelectedNotice });

  // 采购详情内嵌多套餐付费面板状态：付费墙 / 订单 / 轮询对账，对齐远端 PaymentPanel
  const { openPaywall, ...payment } = useNoticePayment({
    userKey,
    onRequireLogin,
    onPaid: async (noticeId, planCode) => {
      const unlockType = planCode.includes("single") ? "single" : "subscription";
      // 支付成功后详情拉取期间同样以骨架屏过渡
      unlock.setDetailLoadingId(noticeId);
      try {
        // single 类型：后端已通过 entitlement 发放额度，此处调用 unlock API 消耗额度解锁公告
        // subscription 类型：后端已创建订阅和权益，此处直接解锁
        await unlockNotice(noticeId, userKey || "", unlockType, 0);
      } catch {
        // 支付回调可能已在服务端完成解锁，忽略此处失败
      }
      await membership.refreshMembership();
      // 刷新 AuthContext 的 isVip 状态，确保 VIP 用户隐藏套餐卡片
      if (refreshAuth) await refreshAuth();
      await unlock.loadNoticeDetail({ id: noticeId } as NoticeItem);
      setActionMessage(t("procurement_paidUnlockOk"));
    },
  });

  // 包装 openPaywall：打开付费墙时懒加载套餐列表，避免初始页面加载时多发请求
  const openPaywallWithPlans = (notice: import("../types").NoticeItem) => {
    void membership.loadPaidPlans();
    openPaywall(notice);
  };

  const handlers = useNoticeHandlers({
    userKey,
    isVip,
    setSelectedNotice,
    trackClick,
    trackDetailOpen,
    membership,
    unlock,
    openPaywall: openPaywallWithPlans,
    onRequireLogin,
    setActionMessage,
  });

  // 按 id 打开公告详情：打开前清空上一轮动作提示
  const openNoticeById = async (id: number) => {
    setActionMessage("");
    await unlock.openNoticeById(id);
  };

  // 支付整页跳回后的对账：?order_no=&trade_no=&notice_id= 或仅 ?notice_id=
  usePaymentReturnReconciliation({ refreshMembership: membership.refreshMembership, openNoticeById, setActionMessage, userKey });

  return {
    ...membership,
    ...unlock,
    ...handlers,
    ...payment,
    actionMessage,
    openNoticeById,
  };
}
