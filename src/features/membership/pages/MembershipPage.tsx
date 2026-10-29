/**
 * 会员套餐详情页面（月 / 季度 / 年 三个周期 Tab + 增值服务）
 * Membership Plans Detail Page — Monthly / Quarterly / Yearly tabs
 *
 * @module features/membership/pages/MembershipPage
 * @description 定价区按**周期**分 Tab：月付 → 季付 → 年付；每个 Tab 下三张档位卡：
 *              个人版（L1）/ 企业版（L3）/ 人工对接（L4）——价格、权益、成交都在卡内。
 *              周期 Tab 与周期数全部由目录字段（billingPeriodDays）驱动，不硬编码 30/90/365；
 *              增值服务 Tab 保持服务型 SKU；支付/升级/联系咨询逻辑下沉至 useMembershipPayment。
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Rocket, Search, TrendingUp, Headphones } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { emitAppEvent } from "@/core/events";
import { Button } from "@/shared/ui";
import { PlanCard } from "../components/PlanCard";
import { ServiceCard } from "../components/ServiceCard";
import { ContactQrModal } from "../components/ContactQrModal";
import { UpgradeConfirmModal } from "../components/UpgradeConfirmModal";
import { useMembershipData } from "../hooks/useMembershipData";
import { useMembershipPayment } from "../hooks/useMembershipPayment";
import { useServiceCatalog } from "../hooks/useServiceCatalog";
import { groupServicesByCategory, pickServiceTabGroups, serviceDisplayName, resolveServiceBranch, periodSwitchKey } from "../utils";
import type { ServiceCatalogView } from "@/types/membership";

export default function MembershipPage() {
  const searchParams = useSearchParams();
  const { t, locale } = useLocale();
  const { authUser } = useAuth();
  const noticeId = searchParams.get("notice_id");

  const { plans, comparison, loading, error, currentPlanCode, currentPlanPrice, upgradeCredit, annualCredit } = useMembershipData();

  const {
    buyPlan, startUpgrade, confirmUpgrade,
    upgradeModalOpen, closeUpgradeModal,
    upgradePreview, upgradeLoading, upgradeTargetPlan,
    contactQrOpen, closeContactQr,
  } = useMembershipPayment({ noticeId, currentPlanCode, annualCredit });

  // 周期 Tab：由目录字段派生（月→季→年升序），不假设只有 3 个周期
  const periodTabs = useMemo(() => {
    const days = [
      ...new Set(
        plans
          .flatMap((p) => ((p.periods ?? []).length > 0 ? p.periods : [p]).map((r) => r.billingPeriodDays))
          .filter((d): d is number => d != null && Number.isFinite(d)),
      ),
    ].sort((a, b) => a - b);
    return days.map((days) => ({ days, labelKey: periodSwitchKey(days) }));
  }, [plans]);

  // 当前周期的天数：未手动选 / 选项失效时取最短周期（月付）
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const activeDays =
    selectedDays != null && periodTabs.some((p) => p.days === selectedDays)
      ? selectedDays
      : periodTabs[0]?.days ?? null;

  // 增值服务是独立分区（与周期 Tab 互斥）
  const [showServices, setShowServices] = useState(false);

  /** 当前 Tab 的卡片：每档取该周期的执行行；档内缺该周期就不出现；无周期字段的旧目录退化为单卡 */
  const periodCards = useMemo(() => {
    return plans.flatMap((tier) => {
      const rows = (tier.periods ?? []).length > 0 ? tier.periods : [tier];
      const row = activeDays == null ? rows[0] : rows.find((r) => r.billingPeriodDays === activeDays);
      return row ? [{ tier, row }] : [];
    });
  }, [plans, activeDays]);


  const { services, loading: servicesLoading, error: servicesError, reload: reloadServices } = useServiceCatalog();
  // 订制服务 Tab：读 service_catalog 按 category 分组（新服务目录 8 行，三类全放）。
  const groupedServices = pickServiceTabGroups(groupServicesByCategory(services));

  const GROUP_TITLE_KEY: Record<string, string> = {
    pro_service: "svcGroupProService",
    advisory: "svcGroupAdvisory",
    api_license: "svcGroupApi",
  };

  /** 有价服务：未登录→登录引导；已登录→发 supply-os:pay（与套餐同一支付弹窗） */
  const handleServicePay = (row: ServiceCatalogView) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    // 与 ServiceCard / service-payment 同一判定：非 self 成交形态不下单（弹顾问码）
    if (resolveServiceBranch(row) !== "pay") return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    emitAppEvent("supply-os:pay", {
      code: row.serviceCode,
      name: serviceDisplayName(row, locale),
      price: Number(row.standardPrice),
      currency: row.currency || "CNY",
      noticeId: noticeId ? Number(noticeId) : undefined,
      returnUrl: `${origin}/membership`,
    });
  };

  const hasPlans = plans.length > 0;
  const tabBtn = (active: boolean) =>
    `px-5 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
      active ? "bg-teal-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-teal-300"
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/20">
      {/* ══ Tab 导航：月付 / 季付 / 年付 / 增值服务 ══ */}
      <div className="flex flex-wrap items-center gap-3 mb-6" role="tablist">
        {periodTabs.map((pt) => (
          <button
            key={pt.days}
            type="button"
            role="tab"
            aria-selected={!showServices && activeDays === pt.days}
            onClick={() => {
              setSelectedDays(pt.days);
              setShowServices(false);
            }}
            className={tabBtn(!showServices && activeDays === pt.days)}
            data-testid="period-tab"
            data-billing-days={pt.days}
          >
            {t(pt.labelKey)}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={showServices}
          onClick={() => setShowServices(true)}
          className={tabBtn(showServices)}
          data-testid="services-tab"
        >
          {t("tabServices")}
        </button>
      </div>

      {showServices ? (
        /* 订制服务 Tab：读 service_catalog，按 category 分组渲染 */
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
                      <ServiceCard key={row.serviceCode} row={row} onPay={handleServicePay} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : (
        <>
          {/* 套餐卡片区：当前周期 Tab 下三张档位卡（个人版 / 企业版 / 人工对接） */}
          <section className="bg-gradient-to-b from-slate-50/80 to-white py-12 pb-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">{t("membershipTitle")}</h2>
                <p className="text-base text-slate-600 max-w-xl mx-auto">{t("tabMembershipDesc")}</p>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-80 rounded-2xl border border-slate-200/60 bg-slate-100/70 animate-pulse" />
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
                  <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="plan-list">
                    {comparison &&
                      periodCards.map(({ tier, row }) => (
                        <PlanCard
                          key={row.planCode}
                          tier={tier}
                          row={row}
                          table={comparison}
                          currentPlanPrice={currentPlanPrice}
                          currentPlanCode={currentPlanCode}
                          upgradeCreditOpen={upgradeCredit?.open ?? null}
                          onBuy={buyPlan}
                          onUpgrade={startUpgrade}
                        />
                      ))}
                    {!hasPlans && (
                      <div className="text-center py-12">
                        <p className="text-slate-500 text-lg">{t("membershipNoPlans")}</p>
                      </div>
                    )}
                  </div>

                  {/* 年包抵扣预告：服务端发现可用的 199 成交单时才出现，与下单时真实核销同一口径 */}
                  {annualCredit && Number(annualCredit.amount) > 0 && (
                    <p className="mx-auto mt-4 max-w-7xl text-xs font-semibold text-teal-700" data-testid="annual-credit-hint">
                      {t("annualCreditHint", {
                        amount: `${annualCredit.currency === "CNY" ? "¥" : "$"}${Number(annualCredit.amount).toLocaleString()}`,
                      })}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ═ 为什么升级会员 ═══ */}
          {!loading && hasPlans && (
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

      {/* 升级确认弹窗（抵扣窗口已过时走 onNewPurchase：按目标档原价新购，不动旧订阅） */}
      <UpgradeConfirmModal
        open={upgradeModalOpen}
        preview={upgradePreview}
        loading={upgradeLoading}
        submitting={false}
        currency={upgradeTargetPlan?.currency || "CNY"}
        onClose={closeUpgradeModal}
        onConfirm={confirmUpgrade}
        onNewPurchase={() => {
          closeUpgradeModal();
          if (upgradeTargetPlan) buyPlan(upgradeTargetPlan);
        }}
      />

      {/* 联系咨询客服码弹窗 */}
      <ContactQrModal open={contactQrOpen} onClose={closeContactQr} />
    </div>
  );
}

MembershipPage.displayName = "MembershipPage";
