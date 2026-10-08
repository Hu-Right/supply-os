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
import { fetchUpgradePreview } from "@/core/api/membership";
import type { AnnualPlanCredit, PlanCatalogRow, UpgradePreview } from "@/types";

/** 升级预览加载失败时的兜底值 */
const FALLBACK_PREVIEW: UpgradePreview = {
  can_upgrade: false,
  reason: "PREVIEW_LOAD_FAILED",
  current_plan: null,
  target_plan: null,
  subscription: null,
  quota_used: 0,
  price_difference: 0,
  remaining_after_upgrade: 0,
  expires_at_unchanged: true,
  credit_days: null,
  credit_deadline_at: null,
  new_purchase_price: null,
};

export interface UseMembershipPaymentOptions {
  /** 当前页面关联的招标 ID（从招标详情跳转过来时存在） */
  noticeId?: string | null;
  /** 当前用户已持有的套餐 code */
  currentPlanCode?: string | null;
  /**
   * 可用的年包抵扣单（文档「199 升级年包可全额抵扣」，服务端下发）：
   * 只用于把弹窗展示价与真实应付对齐；核销与最终金额由支付服务端下单时再算一次。
   */
  annualCredit?: AnnualPlanCredit | null;
}

export function useMembershipPayment(options: UseMembershipPaymentOptions = {}) {
  const { noticeId, currentPlanCode, annualCredit } = options;
  const { authUser } = useAuth();

  // ── 升级弹窗状态 ──
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<UpgradePreview | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<PlanCatalogRow | null>(null);

  // ── 联系咨询客服码弹窗状态 ──
  const [contactQrOpen, setContactQrOpen] = useState(false);
  const openContactQr = useCallback(() => setContactQrOpen(true), []);
  const closeContactQr = useCallback(() => setContactQrOpen(false), []);

  /** 构建支付 returnUrl */
  const buildReturnUrl = useCallback(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return noticeId
      ? `${origin}/procurement?notice_id=${noticeId}`
      : `${origin}/membership`;
  }, [noticeId]);

  /** 点击「立即购买 / 联系咨询」：contact 档弹客服码（不登录/不下单）；fixed 档走支付 */
  const buyPlan = useCallback((plan: PlanCatalogRow) => {
    if (plan.price_mode === "contact") {
      openContactQr();
      return;
    }
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    if (plan.price_mode !== "fixed") return;
    // 年付档（billing_period_days 非空且 >= 360）才吃年包抵扣；与 applyAnnualPlanCredit 同口径，
    // 仅用于展示金额对齐（真实核销在服务端下单时重算）。
    const period = Number(plan.billing_period_days ?? 0);
    const credit =
      annualCredit && annualCredit.currency === (plan.currency || "CNY") && period >= 360
        ? Number(annualCredit.amount)
        : 0;
    const priceCents = Math.round(Number(plan.price) * 100);
    const creditCents = Math.round(credit * 100);
    const payable = creditCents > 0 && creditCents < priceCents ? (priceCents - creditCents) / 100 : Number(plan.price);
    emitAppEvent("supply-os:pay", {
      code: plan.plan_code,
      name: plan.name_zh,
      price: payable,
      currency: plan.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: buildReturnUrl(),
    });
  }, [authUser, noticeId, buildReturnUrl, openContactQr, annualCredit]);

  /** 点击"升级"：拉取升级预览并打开确认弹窗 */
  const startUpgrade = useCallback((plan: PlanCatalogRow) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    setUpgradeTargetPlan(plan);
    setUpgradeModalOpen(true);
    setUpgradeLoading(true);
    setUpgradePreview(null);
    setUpgradeError(null);

    fetchUpgradePreview(plan.plan_code)
      .then((preview) => {
        setUpgradePreview(preview);
        setUpgradeError(null);
      })
      .catch((err) => {
        setUpgradePreview(FALLBACK_PREVIEW);
        setUpgradeError(err?.message ?? "升级预览加载失败");
      })
      .finally(() => setUpgradeLoading(false));
  }, [authUser]);

  /** 确认升级：关闭弹窗，触发带 upgrade 标记的支付 */
  const confirmUpgrade = useCallback(() => {
    if (!upgradePreview?.can_upgrade || !upgradeTargetPlan) return;
    setUpgradeModalOpen(false);
    emitAppEvent("supply-os:pay", {
      code: upgradeTargetPlan.plan_code,
      name: upgradeTargetPlan.name_zh,
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
    upgradeError,
    upgradeTargetPlan,
    contactQrOpen,
    closeContactQr,
  };
}
