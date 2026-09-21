/**
 * 会员套餐详情页面
 * Membership Plans Detail Page
 *
 * @module features/membership/pages/MembershipPage
 * @description 从数据库动态获取套餐信息，支持 1-5+ 个套餐的自适应展示。
 *              支付/升级逻辑已下沉至 useMembershipPayment hook。
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Rocket, Search, TrendingUp, Headphones } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { PlanComparisonTable } from "../components/PlanComparisonTable";
import { PlanCard } from "../components/PlanCard";
import { ServiceCard } from "../components/ServiceCard";
import { UpgradeConfirmModal } from "../components/UpgradeConfirmModal";
import { useMembershipData } from "../hooks/useMembershipData";
import { useMembershipPayment } from "../hooks/useMembershipPayment";
import { SERVICE_CATALOG } from "../data/service-catalog";

type MembershipTab = "personal" | "enterprise" | "services";
const MEMBERSHIP_TABS: { key: MembershipTab; labelKey: string }[] = [
  { key: "personal", labelKey: "tabPersonal" },
  { key: "enterprise", labelKey: "tabEnterprise" },
  { key: "services", labelKey: "tabServices" },
];

export default function MembershipPage() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { isVip } = useAuth();
  const noticeId = searchParams.get("notice_id");

  const { plans, loading, error, currentPlanCode, currentPlanPrice } = useMembershipData();

  // 支付/升级逻辑已下沉至 hook
  const {
    buyPlan, startUpgrade, confirmUpgrade,
    upgradeModalOpen, closeUpgradeModal,
    upgradePreview, upgradeLoading, upgradeTargetPlan,
  } = useMembershipPayment({ noticeId, currentPlanCode });

  const [expandedPlanCode, setExpandedPlanCode] = useState<string | null>(null);
  const [tab, setTab] = useState<MembershipTab>("personal");

  // 按档位分流：企业档(rank>=4)归“企业会员” Tab，其余（体验/标准/专业）归“个人会员” Tab。
  const tabPlans = plans.filter((p) =>
    tab === "enterprise" ? Number(p.benefit_rank ?? 0) >= 4 : Number(p.benefit_rank ?? 0) < 4,
  );
  const enterpriseServices = SERVICE_CATALOG.filter((s) => s.group === "enterprise");
  const serviceCatalog = SERVICE_CATALOG.filter((s) => s.group === "services");

  const handleToggle = (planCode: string) => {
    setExpandedPlanCode((prev) => (prev === planCode ? null : planCode));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/20">
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8 mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">{t("membershipHeroTitle")}</h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          {t("membershipHeroDesc")}
        </p>
      </section>

      {/* ══ Tab 导航（功能化）══ */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {MEMBERSHIP_TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
              tab === tb.key ? "bg-teal-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-teal-300"
            }`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === "services" ? (
        /* 增值服务 Tab：报价表三~十大类留资卡（不走支付） */
        <section className="py-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">{t("servicesSectionTitle")}</h2>
              <p className="text-base text-slate-600 max-w-2xl mx-auto">
                {t("servicesSectionDesc")}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {serviceCatalog.map((item) => (
                <ServiceCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <>
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
                <div className="flex flex-col gap-4 max-w-3xl mx-auto">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-sm px-6 py-5 shadow-lg animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-slate-200/60 rounded-xl shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="h-5 bg-slate-200/60 rounded w-1/3 mb-2" />
                          <div className="h-8 bg-slate-200/60 rounded w-1/4" />
                        </div>
                        <div className="h-8 w-8 bg-slate-200/60 rounded-full" />
                      </div>
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
              ) : (
                <>
                  <div className="flex flex-col gap-4 max-w-3xl mx-auto" data-testid="plan-list">
                    {tabPlans.map((plan) => (
                      <PlanCard
                        key={plan.plan_code}
                        plan={plan}
                        isVip={isVip}
                        currentPlanPrice={currentPlanPrice}
                        currentPlanCode={currentPlanCode}
                        expanded={expandedPlanCode === plan.plan_code}
                        onToggle={() => handleToggle(plan.plan_code)}
                        onBuy={buyPlan}
                        onUpgrade={startUpgrade}
                      />
                    ))}
                    {tabPlans.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-slate-500 text-lg">{t("membershipNoPlans")}</p>
                      </div>
                    )}
                  </div>

                  {/* 企业 Tab：企业版留资服务卡（不走支付） */}
                  {tab === "enterprise" && enterpriseServices.length > 0 && (
                    <div className="mt-12">
                      <h3 className="text-lg font-extrabold text-slate-900 mb-5 text-center">{t("enterpriseServicesTitle")}</h3>
                      <div className="grid gap-5 sm:grid-cols-2 max-w-3xl mx-auto">
                        {enterpriseServices.map((item) => (
                          <ServiceCard key={item.id} item={item} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ═ 为什么升级会员 ═══ */}
          {!loading && tabPlans.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
              <h2 className="text-xl font-extrabold text-slate-900 mb-6">{t("whyUpgradeTitle")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  { icon: Rocket, titleKey: "whyUpgrade1Title", descKey: "whyUpgrade1Desc" },
                  { icon: Search, titleKey: "whyUpgrade2Title", descKey: "whyUpgrade2Desc" },
                  { icon: TrendingUp, titleKey: "whyUpgrade3Title", descKey: "whyUpgrade3Desc" },
                  { icon: Headphones, titleKey: "whyUpgrade4Title", descKey: "whyUpgrade4Desc" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.titleKey} className="flex items-start gap-4 bg-white rounded-xl border border-slate-200 p-5">
                      <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 mb-1">{t(item.titleKey)}</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">{t(item.descKey)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 权益对比表区域 */}
          {!loading && tabPlans.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
              <div className="text-center mb-10">
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
                  {t("membershipComparisonTitle")}
                </h2>
                <p className="text-base text-slate-600 max-w-xl mx-auto">
                  {t("membershipPlansDesc")}
                </p>
              </div>
              <PlanComparisonTable plans={plans} currentPlanCode={currentPlanCode} />
            </section>
          )}
        </>
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
