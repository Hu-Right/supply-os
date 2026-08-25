/**
 * 全局弹窗状态管理 Hook
 * Global Modal State Management Hook
 *
 * @module shared/layout/useAppModals
 * @description 将 App.tsx 中 5 个 useState + 内联类型提取为独立 hook，
 *              降低 App.tsx 职责复杂度，弹窗状态可独立测试。
 */
import { useState, useCallback } from "react";
import type { PayEventDetail } from "@/core/events";

export interface UseAppModalsReturn {
  showAuthModal: boolean;
  setShowAuthModal: (v: boolean) => void;
  showPaymentModal: boolean;
  setShowPaymentModal: (v: boolean) => void;
  paymentPlan: PayEventDetail | null;
  setPaymentPlan: (v: PayEventDetail | null) => void;
  showConsultForm: boolean;
  setShowConsultForm: (v: boolean) => void;
  showTrainingRegisterForm: boolean;
  setShowTrainingRegisterForm: (v: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  /** 事件回调，传给 useAppEvents */
  onRequireLogin: () => void;
  onConsult: () => void;
  onPay: (detail: PayEventDetail) => void;
  onOpenTrainingRegister: () => void;
}

export function useAppModals(): UseAppModalsReturn {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PayEventDetail | null>(null);
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [showTrainingRegisterForm, setShowTrainingRegisterForm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const onRequireLogin = useCallback(() => setShowAuthModal(true), []);
  const onConsult = useCallback(() => setShowConsultForm(true), []);
  const onOpenTrainingRegister = useCallback(() => setShowTrainingRegisterForm(true), []);
  const onPay = useCallback((detail: PayEventDetail) => {
    setPaymentPlan(detail);
    setShowPaymentModal(true);
  }, []);

  return {
    showAuthModal, setShowAuthModal,
    showPaymentModal, setShowPaymentModal,
    paymentPlan, setPaymentPlan,
    showConsultForm, setShowConsultForm,
    showTrainingRegisterForm, setShowTrainingRegisterForm,
    mobileMenuOpen, setMobileMenuOpen,
    onRequireLogin, onConsult, onPay, onOpenTrainingRegister,
  };
}
