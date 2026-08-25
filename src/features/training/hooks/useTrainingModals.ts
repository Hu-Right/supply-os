/**
 * 落地页三弹窗状态管理 Hook
 * Training Landing Page Modal State Hook
 *
 * @module features/training/hooks/useTrainingModals
 * @description 管理报名表单弹窗、动态支付弹窗（红框）、企微二维码弹窗（黄框）
 *              的开关状态与联动逻辑（报名成功 → 自动打开支付弹窗）。
 *              P0-6 安全修复：支付前必须登录，与会员区支付流程对齐（单一数据源）。
 */
import { useState, useCallback } from "react";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";

export interface UseTrainingModalsReturn {
  /** 报名表单弹窗 */
  showRegisterForm: boolean;
  openRegisterForm: () => void;
  closeRegisterForm: () => void;
  /** 动态支付弹窗（红框） */
  showPaymentModal: boolean;
  closePaymentModal: () => void;
  /** 企微二维码弹窗（黄框） */
  showWechatQR: boolean;
  openWechatQR: () => void;
  closeWechatQR: () => void;
  /** 报名成功后关联的 registrationId（传给支付弹窗） */
  registrationId: number | null;
  /** 报名成功回调：关闭表单弹窗并自动打开支付弹窗 */
  handleRegisterSuccess: (registrationId: number | null) => void;
  /** 直接支付（跳过报名表单） */
  handleDirectPay: () => void;
}

export function useTrainingModals(): UseTrainingModalsReturn {
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWechatQR, setShowWechatQR] = useState(false);
  const [registrationId, setRegistrationId] = useState<number | null>(null);
  const { authUser } = useAuth();

  const openRegisterForm = useCallback(() => setShowRegisterForm(true), []);
  const closeRegisterForm = useCallback(() => setShowRegisterForm(false), []);
  const closePaymentModal = useCallback(() => setShowPaymentModal(false), []);
  const openWechatQR = useCallback(() => setShowWechatQR(true), []);
  const closeWechatQR = useCallback(() => setShowWechatQR(false), []);

  // 报名成功 → 关闭表单弹窗并自动打开支付弹窗
  // P0-6 安全修复：报名成功后自动打开支付弹窗前，检查登录状态
  const handleRegisterSuccess = useCallback((id: number | null) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    setRegistrationId(id);
    setShowRegisterForm(false);
    setShowPaymentModal(true);
  }, [authUser]);

  // 直接支付（适合已咨询过的老用户）
  // P0-6 安全修复：支付前必须登录，与会员区支付流程对齐（单一数据源）
  const handleDirectPay = useCallback(() => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    setRegistrationId(null);
    setShowPaymentModal(true);
  }, [authUser]);

  return {
    showRegisterForm, openRegisterForm, closeRegisterForm,
    showPaymentModal, closePaymentModal,
    showWechatQR, openWechatQR, closeWechatQR,
    registrationId, handleRegisterSuccess, handleDirectPay,
  };
}
