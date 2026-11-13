/**
 * 落地页弹窗状态管理 Hook
 * Training Landing Page Modal State Hook
 *
 * @module features/training/hooks/useTrainingModals
 * @description 管理动态支付弹窗（红框）与企微二维码弹窗（黄框）的开关状态。
 *              P0-6 安全修复：支付前必须登录，与会员区支付流程对齐（单一数据源）。
 *
 *              2026-11-13 收敛：独立「报名表单弹窗」已删除——它挂在
 *              `supply-os:open-training-register` 事件上，而全仓没有任何 emit 方（死链），
 *              且其字段与支付弹窗内的报名阶段完全重复。报名信息只在支付弹窗里收一次。
 */
import { useState, useCallback } from "react";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";

export interface UseTrainingModalsReturn {
  /** 动态支付弹窗（红框） */
  showPaymentModal: boolean;
  closePaymentModal: () => void;
  /** 企微二维码弹窗（黄框） */
  showWechatQR: boolean;
  openWechatQR: () => void;
  closeWechatQR: () => void;
  /** 直接支付（跳过报名表单，弹窗内一次填写企业与学员） */
  handleDirectPay: () => void;
}

export function useTrainingModals(): UseTrainingModalsReturn {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWechatQR, setShowWechatQR] = useState(false);
  const { authUser } = useAuth();

  const closePaymentModal = useCallback(() => setShowPaymentModal(false), []);
  const openWechatQR = useCallback(() => setShowWechatQR(true), []);
  const closeWechatQR = useCallback(() => setShowWechatQR(false), []);

  // 直接支付（适合已咨询过的老用户）
  // P0-6 安全修复：支付前必须登录，与会员区支付流程对齐（单一数据源）
  const handleDirectPay = useCallback(() => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    setShowPaymentModal(true);
  }, [authUser]);

  return {
    showPaymentModal, closePaymentModal,
    showWechatQR, openWechatQR, closeWechatQR,
    handleDirectPay,
  };
}
