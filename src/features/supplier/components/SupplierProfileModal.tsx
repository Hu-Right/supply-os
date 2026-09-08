/**
 * 供应商企业主页弹窗
 * Supplier Profile Modal
 *
 * @module features/supplier/components/SupplierProfileModal
 * @description 点击"查看企业主页"时以弹窗形式展示供应商企业档案详情。
 *              使用项目组件库（Card / Badge / EmptyState / Button / Modal）。
 */
import { useState, type ReactNode } from "react";
import {
  Building2, Globe, Crown, Send, ArrowRight,
  FileText, Award, TrendingUp, Target,
  MapPin, Lock, Download,
} from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { Modal, Button, Badge, Card, EmptyState } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import type { Supplier } from "@/types";
import { fetchSupplierContact, type SupplierContact } from "../api";
import { SupplierContactModal, type SupplierContactStatus } from "./SupplierContactModal";

/* ═══════════════════════════════════════════
   常量
   ═══════════════════════════════════════════ */

const PROFILE_TABS = [
  { key: "capability", labelKey: "profile_tabCapability", icon: Building2 },
  { key: "products", labelKey: "profile_tabProducts", icon: FileText },
  { key: "certs", labelKey: "profile_tabCerts", icon: Award },
  { key: "procurement", labelKey: "profile_tabProcurement", icon: Globe },
  { key: "overseas", labelKey: "profile_tabOverseas", icon: TrendingUp },
  { key: "opportunities", labelKey: "profile_tabOpportunities", icon: Target },
] as const;

/* ═══════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════ */

export interface SupplierProfileModalProps {
  supplier: Supplier;
  open: boolean;
  onClose: () => void;
}

export function SupplierProfileModal({ supplier, open, onClose }: SupplierProfileModalProps) {
  const { t, locale } = useLocale();
  const { isVip } = useAuth();
  const userId = useUserId();
  const [activeTab, setActiveTab] = useState("capability");
  const [contactModal, setContactModal] = useState<{
    status: SupplierContactStatus; contact: SupplierContact | null;
  } | null>(null);

  const name = pickLocale(locale, supplier.nameZh, supplier.nameEn);
  const products = pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? [];
  const country = pickLocale(locale, supplier.countryZh, supplier.countryEn);
  const industryName = pickLocale(locale, supplier.industryZh, supplier.industryEn);
  const city = pickLocale(locale, supplier.cityZh, supplier.cityEn);
  const completeness = supplier.dataCompleteness ?? 0;
  const certs = supplier.certifications ?? [];
  const unspsc = supplier.unspscCode || supplier.ungmCode || "";
  const tier = supplier.membershipTier;

  const handleContact = async () => {
    if (!userId || !isVip) { setContactModal({ status: "vipOnly", contact: null }); return; }
    setContactModal({ status: "loading", contact: null });
    try {
      const contact = await fetchSupplierContact(supplier.id);
      setContactModal({ status: "success", contact });
    } catch { setContactModal({ status: "error", contact: null }); }
  };

  const handleUpgrade = () => { setContactModal(null); emitAppEvent("supply-os:require-vip"); };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title=""
        overlayClassName="data-[state=open]:animate-in data-[state=open]:fade-in duration-200"
        className="!max-w-[900px] !w-[92vw] sm:!w-[90vw] !max-h-[92vh] !p-0 !rounded-2xl !overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-200"
      >
        {/* 品牌色顶条 */}
        <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-cyan-400" />

        {/* ═══ 头部 ═══ */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Logo */}
              <div className="shrink-0 w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                {supplier.imageUrl ? (
                  <img src={supplier.imageUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Building2 className="w-7 h-7 text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-slate-900 truncate">{name}</h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {tier === "gold" && <Badge variant="warning">{t("supplierGoldMember")}</Badge>}
                  {tier === "recommended" && <Badge variant="error">{t("supplierRecommended")}</Badge>}
                  {tier === "certified" && <Badge variant="success">{t("supplierCertifiedMember")}</Badge>}
                  <Badge variant="info" shape="pill">{t("profile_verified")}</Badge>
                  {unspsc && <Badge variant="info" shape="pill">UNSPSC{t("profile_unspscMatched")}</Badge>}
                </div>
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{country}{city !== "—" && city !== country ? ` · ${city}` : ""}</span>
                  <span className="text-slate-200">|</span>
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-slate-400" />{industryName}</span>
                </p>
              </div>
            </div>
            <Button onClick={handleContact} variant="primary" className="shrink-0 px-5 py-2.5 text-sm font-bold gap-1.5">
              <Send className="w-4 h-4" />{t("profile_sendInquiry")}
            </Button>
          </div>

          {/* ═══ Tab 导航 ═══ */}
          <div className="flex items-end gap-0 mt-5 border-b border-slate-200 overflow-x-auto">
            {PROFILE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive ? "text-teal-700 font-bold" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-teal-600" : ""}`} />
                  {t(tab.labelKey)}
                  {isActive && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-teal-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ Tab 内容 ═══ */}
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "calc(92vh - 210px)" }}>
          <div className="min-h-[260px]">
            {activeTab === "capability" && (
              <CapabilityTab supplier={supplier} products={products} completeness={completeness} certs={certs} t={t} />
            )}
            {activeTab === "products" && <ProductsTab products={products} unspsc={unspsc} t={t} />}
            {activeTab === "certs" && <CertsTab certs={certs} t={t} />}
            {activeTab === "procurement" && <ProcurementTab unspsc={unspsc} certs={certs} completeness={completeness} t={t} />}
            {activeTab === "overseas" && <OverseasTab country={country} t={t} />}
            {activeTab === "opportunities" && <OpportunitiesTab t={t} onUpgrade={handleUpgrade} />}
          </div>
        </div>
      </Modal>

      {contactModal && (
        <SupplierContactModal supplier={supplier} status={contactModal.status} contact={contactModal.contact} onClose={() => setContactModal(null)} />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   信息行
   ═══════════════════════════════════════════ */

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="shrink-0 w-24 text-sm text-slate-400 font-medium">{label}</span>
      <span className="text-sm text-slate-800 font-bold flex-1">{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 面板
   ═══════════════════════════════════════════ */

interface TabPanelProps { t: (key: string, params?: Record<string, string | number>) => string; }

/** 企业能力总览 */
function CapabilityTab({ supplier, products, completeness, certs, t }: TabPanelProps & {
  supplier: Supplier; products: string[]; completeness: number; certs: string[];
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-teal-600" />{t("profile_capabilityTitle")}
      </h3>

      <Card className="p-0 overflow-hidden">
        <div className="px-5">
          <InfoRow label={t("profile_companyScale")} value={supplier.companyType === "factory" ? t("supplierFactory") : t("supplierTrader")} />
          <InfoRow label={t("profile_mainProducts")} value={products.length > 0 ? products.join("、") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_exportCountries")} value={supplier.countryZh || "—"} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-bold text-slate-700">{t("profile_dataCompleteness")}</span>
          <span className="text-lg font-extrabold text-teal-600">{completeness}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${completeness}%` }} />
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge variant="success" shape="tag"><Award className="w-3.5 h-3.5" />{t("profile_certCount")} {certs.length} 项</Badge>
        <Badge variant="info" shape="tag"><Download className="w-3.5 h-3.5" />{t("profile_exportable")}</Badge>
      </div>

      {products.length === 0 && certs.length === 0 && completeness === 0 && (
        <EmptyState title="该企业暂未完善资料" description="供应商尚未填写企业能力信息" />
      )}
    </div>
  );
}

/** 产品目录 */
function ProductsTab({ products, unspsc, t }: TabPanelProps & { products: string[]; unspsc: string }) {
  if (products.length === 0 && !unspsc) {
    return (
      <div className="space-y-5">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-teal-600" />{t("profile_tabProducts")}</h3>
        <EmptyState title="该企业暂未录入产品信息" description="供应商尚未填写产品目录" />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-teal-600" />{t("profile_tabProducts")}</h3>
      {products.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {products.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <span className="text-sm text-slate-700">{p}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {unspsc && <Badge variant="info" shape="tag">UNSPSC: {unspsc}</Badge>}
    </div>
  );
}

/** 资质证书 */
function CertsTab({ certs, t }: TabPanelProps & { certs: string[] }) {
  if (certs.length === 0) {
    return (
      <div className="space-y-5">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><Award className="w-5 h-5 text-teal-600" />{t("profile_tabCerts")}</h3>
        <EmptyState title="该企业暂未上传资质证书" description="供应商尚未填写认证信息" />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><Award className="w-5 h-5 text-teal-600" />{t("profile_tabCerts")}</h3>
      <div className="flex flex-wrap gap-2">
        {certs.map((c, i) => (
          <Badge key={i} variant="default" shape="tag" className="text-sm py-1.5 px-3"><Award className="w-3.5 h-3.5 text-teal-500" />{c}</Badge>
        ))}
      </div>
    </div>
  );
}

/** 公采适配 */
function ProcurementTab({ unspsc, certs, completeness, t }: TabPanelProps & { unspsc: string; certs: string[]; completeness: number }) {
  const rows: [string, ReactNode][] = [
    [t("profile_unspscMatch"), unspsc ? `${t("profile_unspscMatched")}（92%）` : <span className="text-slate-300">—</span>],
    [t("profile_complianceStandards"), certs.length > 0 ? certs.join(" / ") : <span className="text-slate-300">—</span>],
    [t("profile_qualificationPre"), completeness >= 80 ? t("profile_verified") : <span className="text-slate-300">—</span>],
    [t("profile_restrictionAssess"), completeness >= 70 ? "合规（低风险）" : <span className="text-slate-300">—</span>],
    [t("profile_docSupport"), completeness >= 60 ? "中英双语齐全" : <span className="text-slate-300">—</span>],
    [t("profile_suggestOptimize"), completeness < 90 ? "完善售后服务文件" : <span className="text-teal-600 font-bold">已完善</span>],
  ];
  return (
    <div className="space-y-5">
      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><Globe className="w-5 h-5 text-blue-600" />{t("profile_complianceTitle")}</h3>
      <Card className="p-0 overflow-hidden">
        <div className="px-5">{rows.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold"><Target className="w-3.5 h-3.5" />{t("profile_aiDiagnosis")}</Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-bold"><Lock className="w-3.5 h-3.5" />{t("profile_memberFunction")}</Button>
      </div>
    </div>
  );
}

/** 海外展厅 */
function OverseasTab({ country, t }: TabPanelProps & { country: string }) {
  return (
    <div className="space-y-5">
      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-teal-600" />{t("profile_tabOverseas")}</h3>
      <Card className="p-0 overflow-hidden">
        <div className="px-5">
          <InfoRow label={t("profile_exportCountries")} value={country || <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_overseasNodes")} value={<span className="text-slate-300">—</span>} />
        </div>
      </Card>
      {country === "—" && <EmptyState title="该企业暂未设置海外信息" description="供应商尚未填写海外履约信息" />}
    </div>
  );
}

/** 商机匹配 + 推广权益 */
function OpportunitiesTab({ t, onUpgrade }: TabPanelProps & { onUpgrade: () => void }) {
  const benefits: [string, string][] = [
    [t("profile_platformCert"), t("profile_certifiedSupplier")],
    [t("profile_exposureBoost"), t("profile_industryPlacement")],
    [t("profile_leadPriority"), t("profile_inquiryPriority")],
    [t("profile_eventParticipation"), t("profile_overseasExhibition")],
    [t("profile_contentDistribution"), t("profile_seoCollection")],
    [t("profile_effectTracking"), t("profile_visitorDashboard")],
  ];
  return (
    <div className="space-y-5">
      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2"><Crown className="w-5 h-5 text-amber-600" />{t("profile_benefitsTitle")}</h3>
      <Card className="p-0 overflow-hidden border-2 border-dashed border-amber-200">
        <div className="px-5">{benefits.map(([label, value]) => (
          <div key={label} className="flex items-start gap-4 py-2.5 border-b border-amber-100 last:border-0">
            <span className="shrink-0 w-24 text-sm text-slate-400 font-medium">{label}</span>
            <span className="flex items-center gap-1.5 text-sm text-slate-800 font-bold flex-1"><Lock className="w-3.5 h-3.5 text-amber-400" />{value}</span>
          </div>
        ))}</div>
      </Card>
      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-lg">
        <div>
          <p className="text-sm font-extrabold">{t("profile_supplierMember")}</p>
          <p className="text-xs text-amber-100 mt-0.5">解锁全部供应商推广权益</p>
        </div>
        <Button onClick={onUpgrade} variant="outline" size="sm" className="bg-white text-amber-700 border-white font-extrabold gap-1.5 hover:bg-amber-50">
          {t("profile_upgradePlan")}<ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

SupplierProfileModal.displayName = "SupplierProfileModal";
