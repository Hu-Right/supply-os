/**
 * 会员套餐详情页面
 * Membership Plans Detail Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 从数据库动态获取套餐信息，支持 1-5+ 个套餐的自适应展示。
 *              支付/升级逻辑已下沉至 useMembershipPayment hook。
 */

import { useSearchParams } from "next/navigation";
import { AlertCircle, Rocket, Search, TrendingUp, Headphones } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { PlanComparisonTable } from "../components/PlanComparisonTable";
import { PlanCard } from "../components/PlanCard";
import { UpgradeConfirmModal } from "../components/UpgradeConfirmModal";
import { useMembershipData } from "../hooks/useMembershipData";
import { useMembershipPayment } from "../hooks/useMembershipPayment";
import { getGridCols } from "../utils";

export default function MembershipPage() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const noticeId = searchParams.get("notice_id");

  const { plans: allPlans, loading, error, currentPlanCode, currentPlanPrice } = useMembershipData();

  // 单次解锁卡互斥显示（同商品两档价）
  const plans = (() => {
    const s99 = allPlans.find((p) => p.plan_code === "single_99");
    const s199 = allPlans.find((p) => p.plan_code === "single_199");
    if (!s99 || !s199) return allPlans;
    const showFirstPrice = authUser ? s99.first_purchase_eligible === true : true;
    return allPlans.filter((p) => p.plan_code !== (showFirstPrice ? "single_199" : "single_99"));
  })();

  // 支付/升级逻辑已下沉至 hook
  const {
    buyPlan, startUpgrade, confirmUpgrade,
    upgradeModalOpen, closeUpgradeModal,
    upgradePreview, upgradeLoading, upgradeTargetPlan,
  } = useMembershipPayment({ noticeId, currentPlanCode });

  const gridCols = getGridCols(plans.length);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/20">
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8 mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">会员与套餐</h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          按个人用户、专业投标人、企业团队与深度合作客户设计分层权益。
        </p>
      </section>

      {/* ══ Tab导航 ══ */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {["个人会员", "企业会员", "增值服务"].map((tab, i) => (
          <button
            key={tab}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
              i === 0 ? "bg-teal-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-teal-300"
            }`}
          >
            {tab}
          </button>
        ))}
        <span className="ml-2 text-xs text-amber-600 font-bold flex items-center gap-1">
          💎 年付更优惠 最高可省 20%
        </span>
      </div>

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
              <Button
                type="button"
                variant="link"
                onClick={() => window.location.reload()}
                className="px-0 text-sm font-medium cursor-pointer hover:text-teal-700"
              >
                重新加载
              </Button>
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500 text-lg">{t("membershipNoPlans")}</p>
            </div>
          ) : (
            <div className={`grid ${gridCols} gap-5`} data-testid="plan-list">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.plan_code}
                  plan={plan}
                  isVip={isVip}
                  currentPlanPrice={currentPlanPrice}
                  currentPlanCode={currentPlanCode}
                  onBuy={buyPlan}
                  onUpgrade={startUpgrade}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═ 为什么升级会员 ═══ */}
      {!loading && plans.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <h2 className="text-xl font-extrabold text-slate-900 mb-6">为什么要升级会员</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { icon: Rocket, title: "更快看到订单", desc: "更多商机与实时提醒，第一时间抢占全球采购先机。" },
              { icon: Search, title: "更深拿到信息", desc: "解锁附件、下载原文与中标情报，让投标更有把握。" },
              { icon: TrendingUp, title: "更高提高投标效率", desc: "AI评分、批量导出、团队协作，把更多时间用在赢单上。" },
              { icon: Headphones, title: "更自然连接顾问服务", desc: "专属顾问答疑与行业资源，帮助你少走弯路、少踩坑。" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-4 bg-white rounded-xl border border-slate-200 p-5">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 mb-1">{item.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
        onClose={closeUpgradeModal}
        onConfirm={confirmUpgrade}
      />
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
