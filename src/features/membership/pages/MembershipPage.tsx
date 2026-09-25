/**
 * 会员套餐详情页面（个人版 / 企业版 / 增值服务 三分区）
 * Membership Plans Detail Page — Personal / Enterprise / Services tabs
 *
 * @module features/membership/pages/MembershipPage
 * @description 套餐按后端派生的 audience 分个人版/企业版两个 Tab 渲染，增值服务 Tab 保持现有服务型 SKU；
 *              支付/升级/联系咨询逻辑下沉至 useMembershipPayment。
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Rocket, Search, TrendingUp, Headphones } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";
import { Button } from "@/shared/ui";
import { PlanCard } from "../components/PlanCard";
import { ServiceCard } from "../components/ServiceCard";
import { EnterpriseCompanionCard } from "../components/EnterpriseCompanionCard";
import { ContactQrModal } from "../components/ContactQrModal";
import { UpgradeConfirmModal } from "../components/UpgradeConfirmModal";
import { useMembershipData } from "../hooks/useMembershipData";
import { useMembershipPayment } from "../hooks/useMembershipPayment";
import { useServiceCatalog } from "../hooks/useServiceCatalog";
import { groupPlansByAudience, groupServicesByCategory, pickServiceTabGroups, serviceDisplayName, pickEnterpriseTabServices } from "../utils";
import type { ServiceCatalogRow } from "@/types/membership";

type MembershipTab = "personal" | "enterprise" | "services";
const MEMBERSHIP_TABS: { key: MembershipTab; labelKey: string }[] = [
  { key: "personal", labelKey: "tabPersonal" },
  { key: "enterprise", labelKey: "tabEnterprise" },
  { key: "services", labelKey: "tabServices" },
];

export default function MembershipPage() {
  const searchParams = useSearchParams();
  const { t, locale } = useLocale();
  const { authUser } = useAuth();
  const noticeId = searchParams.get("notice_id");

  const { plans, comparison, loading, error, currentPlanCode, currentPlanPrice } = useMembershipData();

  const {
    buyPlan, startUpgrade, confirmUpgrade,
    upgradeModalOpen, closeUpgradeModal,
    upgradePreview, upgradeLoading, upgradeTargetPlan,
    contactQrOpen, closeContactQr,
  } = useMembershipPayment({ noticeId, currentPlanCode });

  const [tab, setTab] = useState<MembershipTab>("personal");

  const { personal, enterprise } = groupPlansByAudience(plans);
  const { services, loading: servicesLoading, error: servicesError, reload: reloadServices } = useServiceCatalog();
  // 订制服务 Tab：只展示 advisory + api_license（pro_service 归企业 Tab）
  const groupedServices = pickServiceTabGroups(groupServicesByCategory(services));
  // 企业 Tab 额外并列的服务卡（199 人工找单）：非订阅档，从服务目录按集中常量取。
  const enterpriseServices = tab === "enterprise" ? pickEnterpriseTabServices(services) : [];

  const GROUP_TITLE_KEY: Record<string, string> = {
    pro_service: "svcGroupProService",
    advisory: "svcGroupAdvisory",
    api_license: "svcGroupApi",
  };

  /** 有价服务：未登录→登录引导；已登录→发 supply-os:pay（与套餐同一支付弹窗） */
  const handleServicePay = (row: ServiceCatalogRow) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    if (row.standard_price == null || Number(row.standard_price) <= 0) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    emitAppEvent("supply-os:pay", {
      code: row.service_code,
      name: serviceDisplayName(row, locale),
      price: Number(row.standard_price),
      currency: row.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: `${origin}/membership`,
    });
  };

  const isPlanTab = tab !== "services";
  const currentPlans = tab === "personal" ? personal : tab === "enterprise" ? enterprise : [];
  const sectionTitleKey = tab === "personal" ? "membershipPlansPersonalTitle" : "membershipPlansEnterpriseTitle";
  const sectionDescKey = tab === "personal" ? "membershipPlansPersonalDesc" : "membershipPlansEnterpriseDesc";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/20">
      {/* ══ Tab 导航 ══ */}
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
        /* 订制服务 Tab：读 crm_service_catalog，按 category 分组渲染 */
        <section className="py-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">{t("servicesSectionTitle")}</h2>
              <p className="text-base text-slate-600 max-w-2xl mx-auto">{t("servicesSectionDesc")}</p>
            </div>

            {servicesLoading && <p className="py-16 text-center text-sm text-slate-400">{t("servicesLoading")}</p>}
            {servicesError && !servicesLoading && (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">{t("servicesError")}</p>
                <button type="button" onClick={reloadServices} className="mt-2 cursor-pointer text-xs font-bold text-teal-600 hover:underline">
                  {t("servicesRetry")}
                </button>
              </div>
            )}
            {!servicesLoading && !servicesError && Object.keys(groupedServices).length === 0 && (
              <p className="py-16 text-center text-sm text-slate-400">{t("servicesEmpty")}</p>
            )}

            {!servicesLoading &&
              Object.entries(groupedServices).map(([cat, rows]) => (
                <div key={cat} className="mb-12">
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{t(GROUP_TITLE_KEY[cat] ?? cat)}</h3>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((row) => (
                      <ServiceCard key={row.service_code} row={row} onPay={handleServicePay} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : (
        <>
          {/* 套餐卡片区域（个人版 / 企业版） */}
          <section className="bg-gradient-to-b from-slate-50/80 to-white py-16 pb-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-10">
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">{t(sectionTitleKey)}</h2>
                <p className="text-base text-slate-600 max-w-xl mx-auto">{t(sectionDescKey)}</p>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-72 rounded-2xl border border-slate-200/60 bg-slate-100/70 animate-pulse" />
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
                  <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto" data-testid="plan-list">
                    {comparison &&
                      currentPlans.map((plan) => (
                        <PlanCard
                          key={plan.plan_code}
                          plan={plan}
                          table={comparison}
                          currentPlanPrice={currentPlanPrice}
                          currentPlanCode={currentPlanCode}
                          onBuy={buyPlan}
                          onUpgrade={startUpgrade}
                        />
                      ))}
                    {currentPlans.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-slate-500 text-lg">{t("membershipNoPlans")}</p>
                      </div>
                    )}
                    {/* 企业 Tab：与订阅卡并列的人工服务卡（199，同一视觉语言） */}
                    {enterpriseServices.map((row) => (
                      <EnterpriseCompanionCard key={row.service_code} row={row} onPay={handleServicePay} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ═ 为什么升级会员 ═══ */}
          {isPlanTab && !loading && currentPlans.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
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

      {/* 联系咨询客服码弹窗 */}
      <ContactQrModal open={contactQrOpen} onClose={closeContactQr} />
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
