/**
 * 供应商企业主页（模块06 设计图还原）
 * Supplier Enterprise Profile Page — Module 06
 *
 * @module features/supplier-profile/components/SupplierProfilePage
 * @description 按「6-供应商企业主页」样图实现：Logo+公司名+标签+CTA +
 *              6 Tab 导航 + 三栏内容卡片（企业能力/公采适配/推广权益）。
 *              数据优先走 API，缺失字段用静态 mock 数据占位。
 */
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Building2, Globe, Crown, Send, ExternalLink, ArrowRight,
  ShieldCheck, FileText, Award, TrendingUp, Users, Target, MessageSquare,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";

/** Tab 定义 */
const PROFILE_TABS = [
  { key: "capability", labelKey: "profile_tabCapability", icon: Building2 },
  { key: "products", labelKey: "profile_tabProducts", icon: FileText },
  { key: "certs", labelKey: "profile_tabCerts", icon: Award },
  { key: "procurement", labelKey: "profile_tabProcurement", icon: Globe },
  { key: "overseas", labelKey: "profile_tabOverseas", icon: TrendingUp },
  { key: "opportunities", labelKey: "profile_tabOpportunities", icon: Target },
] as const;

/** Mock 供应商数据 */
const MOCK_PROFILE = {
  name: "浙江某新能源科技有限公司",
  nameEn: "Zhejiang New Energy Technology Co., Ltd.",
  verified: true,
  unspscMatched: true,
  intlReady: true,
  location: "中国·浙江",
  mainProducts: "光伏组件 / 储能系统 / 逆变器",
  exportCountries: "20+ 国家",
  scale: "中型企业",
  annualCapacity: "1.2GW+",
  exportNodes: "德国 / 阿联酋 / 南非（示例）",
  dataCompleteness: 92,
  certCount: 8,
  unspscMatchPercent: 92,
  complianceStandards: "ISO / IEC / CE / TUV 等",
  qualificationPre: "已通过 5 类",
  restrictionAssess: "合规（低风险）",
  docSupport: "中英双语齐全",
  suggestOptimize: "完善售后服务文件",
};

export function SupplierProfilePage() {
  const { t } = useLocale();
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("capability");
  const profile = MOCK_PROFILE;

  return (
    <div className="space-y-6">
      {/* ═══ 页头：Logo + 公司名 + 标签 + CTA ═══ */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* 左侧：Logo + 公司信息 */}
          <div className="flex items-start gap-5">
            {/* Logo 占位 */}
            <div className="shrink-0 w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <span className="text-xs font-bold text-slate-400">LOGO</span>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">{profile.name}</h1>
              {/* 标签行 */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {profile.verified && (
                  <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
                    {t("profile_verified")}
                  </span>
                )}
                {profile.unspscMatched && (
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                    {t("profile_unspscMatched")}
                  </span>
                )}
                {profile.intlReady && (
                  <span className="px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold">
                    {t("profile_intlProcurement")}
                  </span>
                )}
              </div>
              {/* 公司详情 */}
              <p className="text-sm text-slate-500 mt-2">
                {profile.location}
                <span className="mx-2 text-slate-300">|</span>
                主营：{profile.mainProducts}
                <span className="mx-2 text-slate-300">|</span>
                出口 {profile.exportCountries}（示例字段）
              </p>
            </div>
          </div>
          {/* 右侧：CTA 按钮 */}
          <Button
            onClick={() => alert(t("procurement_comingSoon"))}
            variant="primary"
            className="shrink-0 px-6 py-3 text-sm font-bold gap-2"
          >
            <Send className="w-4 h-4" />
            {t("profile_sendInquiry")}
          </Button>
        </div>

        {/* ══ Tab 导航 ═══ */}
        <div className="flex flex-wrap items-center gap-1 mt-6 border-b border-slate-200">
          {PROFILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold rounded-t-lg transition-colors border-b-2 ${
                  isActive
                    ? "bg-teal-600 text-white border-teal-600"
                    : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </section>

      {/* ══ 三栏内容卡片 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── 左栏：企业能力总览 ── */}
        <section className="rounded-2xl border border-teal-200 bg-white p-5">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-600" />
            {t("profile_capabilityTitle")}
          </h3>
          <div className="space-y-3 text-sm">
            {[
              [t("profile_companyScale"), profile.scale],
              [t("profile_annualCapacity"), profile.annualCapacity],
              [t("profile_mainProducts"), profile.mainProducts],
              [t("profile_exportCountries"), profile.exportCountries],
              [t("profile_overseasNodes"), profile.exportNodes],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="shrink-0 w-24 text-slate-500 font-medium">{label}</span>
                <span className="text-slate-800 font-bold">{value}</span>
              </div>
            ))}
            {/* 资料完整度 */}
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-24 text-slate-500 font-medium">{t("profile_dataCompleteness")}</span>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-teal-600 font-extrabold">{profile.dataCompleteness}%</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${profile.dataCompleteness}%` }} />
                </div>
              </div>
            </div>
            {/* 认证数量 */}
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-24 text-slate-500 font-medium">{t("profile_certCount")}</span>
              <span className="text-slate-800 font-bold">{profile.certCount} 项</span>
            </div>
          </div>
          {/* 底部标签 + 导出 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
              {t("profile_dataCompleteness")} {profile.dataCompleteness}%
            </span>
            <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
              {t("profile_certCount")} {profile.certCount} 项
            </span>
          </div>
          <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900">
            {t("profile_exportable")} <ExternalLink className="w-3 h-3" />
          </button>
        </section>

        {/* ── 中栏：国际公采适配 ── */}
        <section className="rounded-2xl border border-blue-200 bg-white p-5">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            {t("profile_complianceTitle")}
          </h3>
          <div className="space-y-3 text-sm">
            {[
              [t("profile_unspscMatch"), `${t("profile_unspscMatched")}（${profile.unspscMatchPercent}%）`],
              [t("profile_complianceStandards"), profile.complianceStandards],
              [t("profile_qualificationPre"), profile.qualificationPre],
              [t("profile_restrictionAssess"), profile.restrictionAssess],
              [t("profile_docSupport"), profile.docSupport],
              [t("profile_suggestOptimize"), profile.suggestOptimize],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="shrink-0 w-24 text-slate-500 font-medium">{label}</span>
                <span className="text-slate-800 font-bold">{value}</span>
              </div>
            ))}
          </div>
          {/* 底部按钮 */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100">
              {t("profile_aiDiagnosis")}
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100">
              {t("profile_memberFunction")}
            </button>
          </div>
          <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">
            {t("profile_diagnoseNow")} <ArrowRight className="w-3 h-3" />
          </button>
        </section>

        {/* ── 右栏：供应商推广权益 ── */}
        <section className="rounded-2xl border border-amber-200 bg-white p-5">
          <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-600" />
            {t("profile_benefitsTitle")}
          </h3>
          <div className="space-y-3 text-sm">
            {[
              [t("profile_platformCert"), t("profile_certifiedSupplier")],
              [t("profile_exposureBoost"), t("profile_industryPlacement")],
              [t("profile_leadPriority"), t("profile_inquiryPriority")],
              [t("profile_eventParticipation"), t("profile_overseasExhibition")],
              [t("profile_contentDistribution"), t("profile_seoCollection")],
              [t("profile_effectTracking"), t("profile_visitorDashboard")],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="shrink-0 w-24 text-slate-500 font-medium">{label}</span>
                <span className="text-slate-800 font-bold">{value}</span>
              </div>
            ))}
          </div>
          {/* 底部标签 + 升级 */}
          <div className="mt-4">
            <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
              {t("profile_supplierMember")}
            </span>
          </div>
          <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900">
            {t("profile_upgradePlan")} <ArrowRight className="w-3 h-3" />
          </button>
        </section>
      </div>
    </div>
  );
}

SupplierProfilePage.displayName = "SupplierProfilePage";
