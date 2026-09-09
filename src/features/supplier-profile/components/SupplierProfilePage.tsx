/**
 * 供应商企业主页（模块06 设计图还原 + 真实API对接）
 * Supplier Enterprise Profile Page — Module 06
 *
 * @module features/supplier-profile/components/SupplierProfilePage
 * @description 按「6-供应商企业主页」样图实现：Logo+公司名+标签+CTA +
 *              6 Tab 导航（按需渲染）+ 内容面板。
 *              数据优先走 GET /api/suppliers/:id，缺失字段用 mock 兜底。
 */
import { useState, useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  Building2, Globe, Crown, Send, ExternalLink, ArrowRight,
  FileText, Award, TrendingUp, Target, MapPin, Lock, Download,
} from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { Button, Card, Badge, EmptyState } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { useSupplierProfile } from "../hooks/useSupplierProfile";
import { fetchSupplierContact, type SupplierContact } from "@/features/supplier/api";
import { SupplierContactModal, type SupplierContactStatus } from "@/features/supplier/components/SupplierContactModal";
import type { Supplier } from "@/types";

/* ─ Tab 定义 ── */
const PROFILE_TABS = [
  { key: "capability", labelKey: "profile_tabCapability", icon: Building2 },
  { key: "products", labelKey: "profile_tabProducts", icon: FileText },
  { key: "certs", labelKey: "profile_tabCerts", icon: Award },
  { key: "procurement", labelKey: "profile_tabProcurement", icon: Globe },
  { key: "overseas", labelKey: "profile_tabOverseas", icon: TrendingUp },
  { key: "opportunities", labelKey: "profile_tabOpportunities", icon: Target },
] as const;

/* ── Mock 兜底数据 ── */
const MOCK_PROFILE: Partial<Supplier> = {
  nameZh: "浙江某新能源科技有限公司",
  nameEn: "Zhejiang New Energy Technology Co., Ltd.",
  type: "domestic",
  industryZh: "新能源",
  industryEn: "New Energy",
  countryZh: "中国",
  countryEn: "China",
  cityZh: "浙江",
  cityEn: "Zhejiang",
  mainProductsZh: ["光伏组件", "储能系统", "逆变器"],
  mainProductsEn: ["Solar Panels", "Energy Storage", "Inverters"],
  membershipTier: "gold",
  dataCompleteness: 92,
  unspscCode: "40101500",
  certifications: ["ISO 9001", "CE", "TÜV", "IEC"],
  capabilityTags: ["准时交付 98%", "出口经验", "可定制"],
  companyType: "factory",
};

function enrichWithMock(s: Supplier | null): Supplier | null {
  if (!s) return null;
  const m = MOCK_PROFILE;
  return {
    ...s,
    companyType: s.companyType || m.companyType,
    membershipTier: s.membershipTier || m.membershipTier,
    dataCompleteness: s.dataCompleteness ?? m.dataCompleteness,
    unspscCode: s.unspscCode || s.ungmCode || m.unspscCode,
    certifications: s.certifications?.length ? s.certifications : m.certifications,
    capabilityTags: s.capabilityTags?.length ? s.capabilityTags : m.capabilityTags,
    mainProductsZh: s.mainProductsZh?.length ? s.mainProductsZh : m.mainProductsZh,
    mainProductsEn: s.mainProductsEn?.length ? s.mainProductsEn : m.mainProductsEn,
  } as Supplier;
}

/* ═══════════════════════════════════════════
   主组件
   ═════════════════════════════════════════ */

export function SupplierProfilePage() {
  const { t, locale } = useLocale();
  const { isVip } = useAuth();
  const userId = useUserId();
  const params = useParams();
  const id = String(params?.id ?? "");

  const { supplier: rawSupplier, loading } = useSupplierProfile(locale, id);
  const supplier = useMemo(() => enrichWithMock(rawSupplier), [rawSupplier]);

  const [activeTab, setActiveTab] = useState("capability");
  const [contactModal, setContactModal] = useState<{
    status: SupplierContactStatus; contact: SupplierContact | null;
  } | null>(null);

  const name = supplier ? pickLocale(locale, supplier.nameZh, supplier.nameEn) : "";
  const products = supplier ? pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? [] : [];
  const country = supplier ? pickLocale(locale, supplier.countryZh, supplier.countryEn) : "";
  const industryName = supplier ? pickLocale(locale, supplier.industryZh, supplier.industryEn) : "";
  const city = supplier ? pickLocale(locale, supplier.cityZh, supplier.cityEn) : "";
  const completeness = supplier?.dataCompleteness ?? 0;
  const certs = supplier?.certifications ?? [];
  const unspsc = supplier?.unspscCode || supplier?.ungmCode || "";
  const tier = supplier?.membershipTier;

  const handleContact = async () => {
    if (!supplier) return;
    if (!userId || !isVip) { setContactModal({ status: "vipOnly", contact: null }); return; }
    setContactModal({ status: "loading", contact: null });
    try {
      const contact = await fetchSupplierContact(supplier.id);
      setContactModal({ status: "success", contact });
    } catch { setContactModal({ status: "error", contact: null }); }
  };

  const handleUpgrade = () => { setContactModal(null); emitAppEvent("supply-os:require-vip"); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="py-20 text-center">
        <EmptyState title="供应商不存在" description="该供应商ID无效或已被移除" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* ═══ 页头 ══ */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="flex items-start gap-5">
              <div className="shrink-0 w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                {supplier.imageUrl ? (
                  <img src={supplier.imageUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Building2 className="w-8 h-8 text-slate-300" />
                )}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">{name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {tier === "gold" && <Badge variant="warning">金牌会员</Badge>}
                  {tier === "certified" && <Badge variant="success">认证会员</Badge>}
                  {tier === "recommended" && <Badge variant="error">推荐</Badge>}
                  <Badge variant="info" shape="pill">{t("profile_verified")}</Badge>
                  {unspsc && <Badge variant="info" shape="pill">UNSPSC{t("profile_unspscMatched")}</Badge>}
                </div>
                <p className="text-sm text-slate-500 mt-2 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{country}{city !== "—" && city !== country ? ` · ${city}` : ""}</span>
                  <span className="text-slate-300">|</span>
                  <span>主营：{products.slice(0, 3).join(" / ")}</span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{industryName}</span>
                </p>
              </div>
            </div>
            <Button onClick={handleContact} variant="primary" className="shrink-0 px-6 py-3 text-sm font-bold gap-2">
              <Send className="w-4 h-4" />{t("profile_sendInquiry")}
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

        {/* ══ Tab 内容（按需渲染） ═══ */}
        {activeTab === "capability" && (
          <CapabilityPanel supplier={supplier} products={products} completeness={completeness} certs={certs} country={country} t={t} />
        )}
        {activeTab === "products" && (
          <ProductsPanel products={products} unspsc={unspsc} t={t} />
        )}
        {activeTab === "certs" && (
          <CertsPanel certs={certs} t={t} />
        )}
        {activeTab === "procurement" && (
          <ProcurementPanel unspsc={unspsc} certs={certs} completeness={completeness} t={t} />
        )}
        {activeTab === "overseas" && (
          <OverseasPanel country={country} city={city} t={t} />
        )}
        {activeTab === "opportunities" && (
          <OpportunitiesPanel t={t} onUpgrade={handleUpgrade} />
        )}
      </div>

      {contactModal && supplier && (
        <SupplierContactModal supplier={supplier} status={contactModal.status} contact={contactModal.contact} onClose={() => setContactModal(null)} />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   信息行
   ══════════════════════════════════════════ */

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{label}</span>
      <span className="text-slate-800 font-bold text-sm flex-1">{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 面板
   ══════════════════════════════════════════ */

interface PanelProps { t: (key: string, params?: Record<string, string | number>) => string; }

/** 企业能力总览 */
function CapabilityPanel({ supplier, products, completeness, certs, country, t }: PanelProps & {
  supplier: Supplier; products: string[]; completeness: number; certs: string[]; country: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <section className="rounded-2xl border border-teal-200 bg-white p-5">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-teal-600" />{t("profile_capabilityTitle")}
        </h3>
        <div className="space-y-1">
          <InfoRow label={t("profile_companyScale")} value={supplier.companyType === "factory" ? t("supplierFactory") : t("supplierTrader")} />
          <InfoRow label={t("profile_annualCapacity")} value="—" />
          <InfoRow label={t("profile_mainProducts")} value={products.length > 0 ? products.join(" / ") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_exportCountries")} value={country || <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_overseasNodes")} value={<span className="text-slate-300">—</span>} />
          <div className="flex items-center gap-3 py-1.5">
            <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{t("profile_dataCompleteness")}</span>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-teal-600 font-extrabold text-sm">{completeness}%</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${completeness}%` }} />
              </div>
            </div>
          </div>
          <InfoRow label={t("profile_certCount")} value={`${certs.length} 项`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
            {t("profile_dataCompleteness")} {completeness}%
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
            {t("profile_certCount")} {certs.length} 项
          </span>
        </div>
        <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900">
          {t("profile_exportable")} <ExternalLink className="w-3 h-3" />
        </button>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-white p-5">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-600" />{t("profile_complianceTitle")}
        </h3>
        <div className="space-y-1">
          <InfoRow label={t("profile_unspscMatch")} value={unspsc ? `${t("profile_unspscMatched")}（92%）` : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_complianceStandards")} value={certs.length > 0 ? certs.join(" / ") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_qualificationPre")} value={completeness >= 80 ? t("profile_verified") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_restrictionAssess")} value={completeness >= 70 ? "合规（低风险）" : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_docSupport")} value={completeness >= 60 ? "中英双语齐全" : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_suggestOptimize")} value={completeness < 90 ? "完善售后服务文件" : <span className="text-teal-600">已完善</span>} />
        </div>
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

      <section className="rounded-2xl border border-amber-200 bg-white p-5">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-600" />{t("profile_benefitsTitle")}
        </h3>
        <div className="space-y-1">
          {[
            [t("profile_platformCert"), t("profile_certifiedSupplier")],
            [t("profile_exposureBoost"), t("profile_industryPlacement")],
            [t("profile_leadPriority"), t("profile_inquiryPriority")],
            [t("profile_eventParticipation"), t("profile_overseasExhibition")],
            [t("profile_contentDistribution"), t("profile_seoCollection")],
            [t("profile_effectTracking"), t("profile_visitorDashboard")],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start gap-3 py-1.5">
              <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{label}</span>
              <span className="flex items-center gap-1 text-slate-800 font-bold text-sm">
                <Lock className="w-3 h-3 text-amber-400" />{value}
              </span>
            </div>
          ))}
        </div>
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
  );
}

const unspsc = "";

/** 产品目录 */
function ProductsPanel({ products, unspsc: _unspsc, t }: PanelProps & { products: string[]; unspsc: string }) {
  if (products.length === 0) {
    return <div className="py-10"><EmptyState title="暂无产品信息" description="该供应商尚未录入产品目录" /></div>;
  }
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" />{t("profile_tabProducts")}
        </h3>
      </div>
      <div className="divide-y divide-slate-100">
        {products.map((p, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
            <span className="text-sm text-slate-700">{p}</span>
          </div>
        ))}
      </div>
      {_unspsc && (
        <div className="px-5 py-3 border-t border-slate-100">
          <Badge variant="info" shape="tag">UNSPSC: {_unspsc}</Badge>
        </div>
      )}
    </Card>
  );
}

/** 资质证书 */
function CertsPanel({ certs, t }: PanelProps & { certs: string[] }) {
  if (certs.length === 0) {
    return <div className="py-10"><EmptyState title="暂无资质证书" description="该供应商尚未上传认证信息" /></div>;
  }
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-teal-600" />{t("profile_tabCerts")}
      </h3>
      <div className="flex flex-wrap gap-2">
        {certs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-xs">
            <Award className="w-4 h-4 text-teal-500" />{c}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** 公采适配 */
function ProcurementPanel({ unspsc: _unspsc, certs, completeness, t }: PanelProps & { unspsc: string; certs: string[]; completeness: number }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-600" />{t("profile_complianceTitle")}
      </h3>
      <div className="space-y-1">
        <InfoRow label={t("profile_unspscMatch")} value={_unspsc ? `${t("profile_unspscMatched")}（92%）` : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_complianceStandards")} value={certs.length > 0 ? certs.join(" / ") : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_qualificationPre")} value={completeness >= 80 ? t("profile_verified") : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_restrictionAssess")} value={completeness >= 70 ? "合规（低风险）" : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_docSupport")} value={completeness >= 60 ? "中英双语齐全" : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_suggestOptimize")} value={completeness < 90 ? "完善售后服务文件" : <span className="text-teal-600">已完善</span>} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold"><Target className="w-3.5 h-3.5" />{t("profile_aiDiagnosis")}</Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-bold"><Lock className="w-3.5 h-3.5" />{t("profile_memberFunction")}</Button>
      </div>
    </Card>
  );
}

/** 海外展厅 */
function OverseasPanel({ country, city, t }: PanelProps & { country: string; city: string }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-teal-600" />{t("profile_tabOverseas")}
      </h3>
      <div className="space-y-1">
        <InfoRow label={t("profile_exportCountries")} value={country || <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_overseasNodes")} value={<span className="text-slate-300">—</span>} />
      </div>
      {country === "—" && <div className="mt-4"><EmptyState title="暂无海外信息" description="该供应商尚未填写海外履约信息" /></div>}
    </Card>
  );
}

/** 商机匹配 + 推广权益 */
function OpportunitiesPanel({ t, onUpgrade }: PanelProps & { onUpgrade: () => void }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <Crown className="w-5 h-5 text-amber-600" />{t("profile_benefitsTitle")}
      </h3>
      <div className="space-y-1">
        {[
          [t("profile_platformCert"), t("profile_certifiedSupplier")],
          [t("profile_exposureBoost"), t("profile_industryPlacement")],
          [t("profile_leadPriority"), t("profile_inquiryPriority")],
          [t("profile_eventParticipation"), t("profile_overseasExhibition")],
          [t("profile_contentDistribution"), t("profile_seoCollection")],
          [t("profile_effectTracking"), t("profile_visitorDashboard")],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 py-1.5">
            <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{label}</span>
            <span className="flex items-center gap-1 text-slate-800 font-bold text-sm">
              <Lock className="w-3 h-3 text-amber-400" />{value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow">
        <div>
          <p className="text-sm font-extrabold">{t("profile_supplierMember")}</p>
          <p className="text-xs text-amber-100">解锁全部供应商推广权益</p>
        </div>
        <Button onClick={onUpgrade} variant="outline" size="sm" className="bg-white text-amber-700 border-white font-extrabold gap-1.5 hover:bg-amber-50">
          {t("profile_upgradePlan")}<ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}

SupplierProfilePage.displayName = "SupplierProfilePage";
