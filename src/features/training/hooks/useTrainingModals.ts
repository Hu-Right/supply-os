/**
 * 落地页弹窗状态管理 Hook
 * Training Landing Page Modal State Hook
 *
 * @module features/training/hooks/useTrainingModals
 * @description 管理动态支付弹窗和企微二维码弹窗的开关状态。
 *              P0-6 安全修复：支付前必须登录，与会员区支付流程对齐（单一数据源）。
 */
import { useState, useCallback } from "react";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";

export interface UseTrainingModalsReturn {
  /** 动态支付弹窗 */
  showPaymentModal: boolean;
  closePaymentModal: () => void;
  /** 企微二维码弹窗 */
  showWechatQR: boolean;
  openWechatQR: () => void;
  closeWechatQR: () => void;
  /** 直接支付 */
  handleDirectPay: () => void;
}

export function useTrainingModals(): UseTrainingModalsReturn {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWechatQR, setShowWechatQR] = useState(false);
  const { authUser } = useAuth();

  const closePaymentModal = useCallback(() => setShowPaymentModal(false), []);
  const openWechatQR = useCallback(() => setShowWechatQR(true), []);
  const closeWechatQR = useCallback(() => setShowWechatQR(false), []);

  // 直接支付
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
