/**
 * 公告详情与支付动作 Hook
 * Notice Detail & Payment Actions Hook
 *
 * @module features/procurement/hooks/useNoticeActions
 * @description 采购详情页动作编排层：组合会员配额、解锁集合与详情加载、
 *              动作处理器与支付回跳对账。路由级
 *              selectedNotice 由 Page 持有并经 setSelectedNotice 注入，
 *              避免与搜索/偏好 hook 循环依赖。
 *              配额不足的付费引导已统一为跳转会员套餐页，
 *              支付成功解锁由 supply-os:notice-paid 事件与回跳对账承担。
 */
import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { emitAppEvent } from "@/core/events";
import type { NoticeItem } from "../types";
import { useNoticeMembership, type UseNoticeMembershipReturn } from "./useNoticeMembership";
import { useNoticeUnlock, type UseNoticeUnlockReturn } from "./useNoticeUnlock";
import { useNoticeHandlers, type UseNoticeHandlersReturn } from "./useNoticeHandlers";
import { useNoticeFavorite, type UseNoticeFavoriteReturn } from "./useNoticeFavorite";
import { usePaymentReturnReconciliation } from "./usePaymentReturnReconciliation";

export interface UseNoticeActionsOptions {
  userId: number | undefined; // 当前登录用户 ID
  isVip: boolean; // 是否 VIP（决定免费配额门槛与解锁类型）
  items: NoticeItem[]; // 当前列表数据（openNoticeById 复用列表内已有项）
  setSelectedNotice: Dispatch<SetStateAction<NoticeItem | null>>; // Page 持有的选中详情设置器
  trackClick: (noticeId: number) => void; // T-B9 点击埋点（useNoticeFeedback）
  trackDetailOpen: (noticeId: number) => void; // T-C7 详情打开埋点（useNoticeFeedback）
}

export interface UseNoticeActionsReturn
  extends UseNoticeMembershipReturn,
    UseNoticeUnlockReturn,
    UseNoticeHandlersReturn,
    UseNoticeFavoriteReturn {
  actionMessage: string;
}

export function useNoticeActions(options: UseNoticeActionsOptions): UseNoticeActionsReturn {
  const { userId, isVip, items, setSelectedNotice, trackClick, trackDetailOpen } = options;
  const [actionMessage, setActionMessage] = useState("");

  // P2-2：useCallback 稳定引用，作为 openNotice memo 依赖链的一环
  const onRequireLogin = useCallback(() => emitAppEvent("supply-os:require-login"), []);

  const membership = useNoticeMembership({ userId, isVip });
  const unlock = useNoticeUnlock({ userId, items, setSelectedNotice });
  const favorite = useNoticeFavorite({ userId, onRequireLogin });

  const handlers = useNoticeHandlers({
    userId,
    isVip,
    setSelectedNotice,
    trackClick,
    trackDetailOpen,
    membership,
    unlock,
    onRequireLogin,
    setActionMessage,
  });

  // 按 id 打开公告详情：打开前清空上一轮动作提示
  const openNoticeById = async (id: number) => {
    setActionMessage("");
    await unlock.openNoticeById(id);
  };

  // 支付整页跳回后的对账：?order_no=&trade_no=&notice_id= 或仅 ?notice_id=
  usePaymentReturnReconciliation({ refreshMembership: membership.refreshMembership, openNoticeById, setActionMessage, userId });

  return {
    ...membership,
    ...unlock,
    ...handlers,
    ...favorite,
    actionMessage,
    openNoticeById,
  };
}
