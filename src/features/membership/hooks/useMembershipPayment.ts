/**
 * 会员支付/升级逻辑 hook — 从 MembershipPage 提取
 * Membership Payment Hook — Buy & upgrade flow logic
 *
 * @module features/membership/hooks/useMembershipPayment
 * @description 封装会员购买、升级预览、升级确认的完整交互流程：
 *              - buyPlan：直接购买（触发 supply-os:pay 事件）
 *              - startUpgrade：拉取升级预览并打开确认弹窗
 *              - confirmUpgrade：确认升级并触发带 upgrade 标记的支付
 *              - 弹窗状态（open/preview/loading/targetPlan）统一管理
 *
 *              未登录用户自动触发 require-login 事件，不执行支付。
 */
import { useState, useCallback } from "react";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";
import { fetchUpgradePreview } from "../api";
import type { MembershipPlan, UpgradePreview } from "@/types";

/** 升级预览加载失败时的兜底值 */
const FALLBACK_PREVIEW: UpgradePreview = {
  can_upgrade: false,
  reason: "PREVIEW_LOAD_FAILED",
  current_plan: null,
  target_plan: null,
  quota_used: 0,
  price_difference: 0,
  remaining_after_upgrade: 0,
  expires_at_unchanged: true,
};

export interface UseMembershipPaymentOptions {
  /** 当前页面关联的招标 ID（从招标详情跳转过来时存在） */
  noticeId?: string | null;
  /** 当前用户已持有的套餐 code */
  currentPlanCode?: string | null;
}

export function useMembershipPayment(options: UseMembershipPaymentOptions = {}) {
  const { noticeId, currentPlanCode } = options;
  const { authUser } = useAuth();

  // ── 升级弹窗状态 ──
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<UpgradePreview | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<MembershipPlan | null>(null);

  /** 构建支付 returnUrl */
  const buildReturnUrl = useCallback(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return noticeId
      ? `${origin}/procurement?notice_id=${noticeId}`
      : `${origin}/membership`;
  }, [noticeId]);

  /** 直接购买套餐 */
  const buyPlan = useCallback((plan: MembershipPlan) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    emitAppEvent("supply-os:pay", {
      code: plan.plan_code,
      name: plan.name,
      price: Number(plan.price),
      currency: plan.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: buildReturnUrl(),
    });
  }, [authUser, noticeId, buildReturnUrl]);

  /** 点击"升级"：拉取升级预览并打开确认弹窗 */
  const startUpgrade = useCallback((plan: MembershipPlan) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    setUpgradeTargetPlan(plan);
    setUpgradeModalOpen(true);
    setUpgradeLoading(true);
    setUpgradePreview(null);

    fetchUpgradePreview(plan.plan_code)
      .then(setUpgradePreview)
      .catch(() => setUpgradePreview(FALLBACK_PREVIEW))
      .finally(() => setUpgradeLoading(false));
  }, [authUser]);

  /** 确认升级：关闭弹窗，触发带 upgrade 标记的支付 */
  const confirmUpgrade = useCallback(() => {
    if (!upgradePreview?.can_upgrade || !upgradeTargetPlan) return;
    setUpgradeModalOpen(false);
    emitAppEvent("supply-os:pay", {
      code: upgradeTargetPlan.plan_code,
      name: upgradeTargetPlan.name,
      price: upgradePreview.price_difference,
      currency: upgradeTargetPlan.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: buildReturnUrl(),
      orderType: "upgrade",
      originalPlanCode: currentPlanCode || "",
    });
  }, [upgradePreview, upgradeTargetPlan, noticeId, currentPlanCode, buildReturnUrl]);

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModalOpen(false);
  }, []);

  return {
    buyPlan,
    startUpgrade,
    confirmUpgrade,
    upgradeModalOpen,
    closeUpgradeModal,
    upgradePreview,
    upgradeLoading,
    upgradeTargetPlan,
  };
}
