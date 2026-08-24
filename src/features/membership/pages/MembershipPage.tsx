/**
 * 会员套餐详情页面
 * Membership Plans Detail Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 从数据库动态获取套餐信息，支持 1-5+ 个套餐的自适应展示。
 *              子模块：utils（工具函数）、hooks（数据加载）、components（卡片组件）。
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { PlanComparisonTable } from "../components/PlanComparisonTable";
import { PlanCard } from "../components/PlanCard";
import { UpgradeConfirmModal } from "../components/UpgradeConfirmModal";
import { useMembershipData } from "../hooks/useMembershipData";
import { fetchUpgradePreview } from "../api";
import { getGridCols } from "../utils";
import type { MembershipPlan, UpgradePreview } from "@/types";

export default function MembershipPage() {
  const [searchParams] = useSearchParams();
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const noticeId = searchParams.get("notice_id");

  const { plans, loading, error, currentPlanCode, currentPlanPrice } = useMembershipData();

  // ── 升级弹窗状态 ──
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<UpgradePreview | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<MembershipPlan | null>(null);

  const handleBuyPlan = (plan: MembershipPlan) => {
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
      returnUrl: noticeId
        ? `${window.location.origin}/procurement?notice_id=${noticeId}`
        : `${window.location.origin}/membership`,
    });
  };

  /** 点击"升级"按钮：拉取升级预览并打开确认弹窗 */
  const handleUpgradePlan = (plan: MembershipPlan) => {
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
      .catch(() => setUpgradePreview({
        can_upgrade: false,
        reason: "PREVIEW_LOAD_FAILED",
        current_plan: null,
        target_plan: null,
        quota_used: 0,
        price_difference: 0,
        remaining_after_upgrade: 0,
        expires_at_unchanged: true,
      }))
      .finally(() => setUpgradeLoading(false));
  };

  /** 确认升级：关闭预览弹窗，触发带 upgrade 标记的支付流程 */
  const handleConfirmUpgrade = () => {
    if (!upgradePreview?.can_upgrade || !upgradeTargetPlan) return;
    setUpgradeModalOpen(false);
    emitAppEvent("supply-os:pay", {
      code: upgradeTargetPlan.plan_code,
      name: upgradeTargetPlan.name,
      price: upgradePreview.price_difference,
      currency: upgradeTargetPlan.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: noticeId
        ? `${window.location.origin}/procurement?notice_id=${noticeId}`
        : `${window.location.origin}/membership`,
      orderType: "upgrade",
      originalPlanCode: currentPlanCode || "",
    });
  };

  const gridCols = getGridCols(plans.length);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/20">
      {/* 套餐卡片区域 */}
      <section className="bg-gradient-to-b from-slate-50/80 to-white py-16 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
              {t("membershipPlansTitle")}
            </h2>
            <p className="text-base text-slate-600 max-w-xl mx-auto">
              {t("membershipPlansDesc")}
            </p>
          </div>

          {loading ? (
            <div className={`grid ${gridCols} gap-5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm p-6 shadow-lg animate-pulse">
                  <div className="h-10 w-10 bg-slate-200/60 rounded-xl mb-5" />
                  <div className="h-5 bg-slate-200/60 rounded w-3/4 mb-3" />
                  <div className="h-10 bg-slate-200/60 rounded w-1/2 mb-5" />
                  <div className="h-3.5 bg-slate-200/60 rounded w-full mb-2" />
                  <div className="h-3.5 bg-slate-200/60 rounded w-5/6 mb-6" />
                  <div className="h-11 bg-slate-200/60 rounded-xl w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-slate-600 text-lg mb-2">{error}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium cursor-pointer"
              >
                重新加载
              </button>
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500 text-lg">{t("membershipNoPlans")}</p>
            </div>
          ) : (
            <div className={`grid ${gridCols} gap-5`}>
              {plans.map((plan) => (
                <PlanCard
                  key={plan.plan_code}
                  plan={plan}
                  isVip={isVip}
                  currentPlanPrice={currentPlanPrice}
                  currentPlanCode={currentPlanCode}
                  onBuy={handleBuyPlan}
                  onUpgrade={handleUpgradePlan}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 权益对比表区域 */}
      {!loading && plans.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
              {t("membershipComparisonTitle")}
            </h2>
            <p className="text-base text-slate-600 max-w-xl mx-auto">
              {t("membershipPlansDesc")}
            </p>
          </div>
          <PlanComparisonTable plans={plans} />
        </section>
      )}

      {/* 升级确认弹窗 */}
      <UpgradeConfirmModal
        open={upgradeModalOpen}
        preview={upgradePreview}
        loading={upgradeLoading}
        submitting={false}
        currency={upgradeTargetPlan?.currency || "CNY"}
        onClose={() => setUpgradeModalOpen(false)}
        onConfirm={handleConfirmUpgrade}
      />
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
