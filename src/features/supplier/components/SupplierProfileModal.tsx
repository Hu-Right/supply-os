/**
 * 供应商企业主页弹窗（视觉优化版）
 * Supplier Profile Modal — Enhanced Visual & Interaction
 *
 * @module features/supplier/components/SupplierProfileModal
 * @description 点击"查看企业主页"时以弹窗形式展示供应商企业档案详情。
 *              优化点：淡入缩放动画、品牌色渐变顶栏、下划线 Tab 指示器、
 *              面板最小高度防抖动、友好空状态、VIP 锁图标区分、移动端全屏适配。
 */
import { useState, type ReactNode } from "react";
import {
  Building2, Globe, Crown, Send, ArrowRight,
  FileText, Award, TrendingUp, Target,
  MapPin, Lock, Inbox,
} from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { Modal, Button } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import type { Supplier } from "@/types";
import { fetchSupplierContact, type SupplierContact } from "../api";
import { SupplierContactModal, type SupplierContactStatus } from "./SupplierContactModal";

/* ═══════════════════════════════════════════
   常量
   ═══════════════════════════════════════════ */

/** Tab 定义 */
const PROFILE_TABS = [
  { key: "capability", labelKey: "profile_tabCapability", icon: Building2 },
  { key: "products", labelKey: "profile_tabProducts", icon: FileText },
  { key: "certs", labelKey: "profile_tabCerts", icon: Award },
  { key: "procurement", labelKey: "profile_tabProcurement", icon: Globe },
  { key: "overseas", labelKey: "profile_tabOverseas", icon: TrendingUp },
  { key: "opportunities", labelKey: "profile_tabOpportunities", icon: Target },
] as const;

/** 会员等级样式 */
const TIER_STYLE: Record<string, { bg: string; labelKey: string }> = {
  gold: { bg: "bg-gradient-to-r from-amber-400 to-amber-600", labelKey: "supplierGoldMember" },
  recommended: { bg: "bg-gradient-to-r from-rose-400 to-rose-600", labelKey: "supplierRecommended" },
  certified: { bg: "bg-gradient-to-r from-teal-400 to-teal-600", labelKey: "supplierCertifiedMember" },
};

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

  // ── 联系方式弹窗状态 ──
  const [contactModal, setContactModal] = useState<{
    status: SupplierContactStatus; contact: SupplierContact | null;
  } | null>(null);

  // ── 派生数据 ──
  const name = pickLocale(locale, supplier.nameZh, supplier.nameEn);
  const products = pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? [];
  const country = pickLocale(locale, supplier.countryZh, supplier.countryEn);
  const industryName = pickLocale(locale, supplier.industryZh, supplier.industryEn);
  const city = pickLocale(locale, supplier.cityZh, supplier.cityEn);
  const completeness = supplier.dataCompleteness ?? 0;
  const certs = supplier.certifications ?? [];
  const unspsc = supplier.unspscCode || supplier.ungmCode || "";
  const tier = supplier.membershipTier;
  const tierStyle = tier ? TIER_STYLE[tier] : null;

  const handleContact = async () => {
    if (!userId || !isVip) {
      setContactModal({ status: "vipOnly", contact: null });
      return;
    }
    setContactModal({ status: "loading", contact: null });
    try {
      const contact = await fetchSupplierContact(supplier.id);
      setContactModal({ status: "success", contact });
    } catch {
      setContactModal({ status: "error", contact: null });
    }
  };

  const handleUpgrade = () => {
    setContactModal(null);
    emitAppEvent("supply-os:require-vip");
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title=""
        /* 遮罩层：淡入动画 */
        overlayClassName="data-[state=open]:animate-in data-[state=open]:fade-in duration-200"
        /* 内容区：缩放 + 淡入动画，900px 宽，移动端全屏 */
        className="!max-w-[900px] !w-[92vw] sm:!w-[90vw] !max-h-[92vh] !p-0 !rounded-2xl !overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-200"
      >
        {/* ═══ 品牌色渐变顶条 ═══ */}
        <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-cyan-400" />

        {/* ═══ 头部区域 ═══ */}
        <div className="px-5 pt-5 pb-0 sm:px-7">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* 左侧：Logo + 公司信息 */}
            <div className="flex items-start gap-4">
              {/* Logo：固定宽高比防止布局偏移 */}
              <div className="shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center overflow-hidden">
                {supplier.imageUrl ? (
                  <img
                    src={supplier.imageUrl}
                    alt={name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <Building2 className="w-7 h-7 text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-slate-900 truncate leading-tight">{name}</h2>
                {/* 标签行 */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {tierStyle && (
                    <span className={`px-2.5 py-0.5 rounded-md text-2xs font-bold text-white shadow-sm ${tierStyle.bg}`}>
                      {t(tierStyle.labelKey)}
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-2xs font-bold">
                    {t("profile_verified")}
                  </span>
                  {unspsc && (
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-2xs font-bold">
                      {t("profile_unspscMatched")}
                    </span>
                  )}
                </div>
                {/* 公司详情 */}
                <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {country}{city !== "—" && city !== country ? ` · ${city}` : ""}
                  </span>
                  <span className="text-slate-200">|</span>
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-slate-400" />
                    {industryName}
                  </span>
                </p>
              </div>
            </div>
            {/* 右侧：CTA 按钮 */}
            <div className="flex gap-2 shrink-0">
              <Button
                onClick={handleContact}
                variant="primary"
                className="px-5 py-2.5 text-xs font-bold gap-1.5 shadow-md shadow-teal-200/50"
              >
                <Send className="w-3.5 h-3.5" />
                {t("profile_sendInquiry")}
              </Button>
            </div>
          </div>

          {/* ═══ Tab 导航（下划线指示器风格） ═══ */}
          <div className="flex items-end gap-0 mt-5 border-b border-slate-200 overflow-x-auto scrollbar-none">
            {PROFILE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
                    isActive
                      ? "text-teal-700"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-teal-600" : ""}`} />
                  {t(tab.labelKey)}
                  {/* 激活态底部高亮指示条 */}
                  {isActive && (
                    <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-teal-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ Tab 内容区（最小高度防抖动） ═══ */}
        <div className="px-5 py-5 sm:px-7 overflow-y-auto" style={{ maxHeight: "calc(92vh - 200px)" }}>
          <div className="min-h-[280px]">
            {activeTab === "capability" && (
              <CapabilityTab
                supplier={supplier}
                products={products}
                completeness={completeness}
                certs={certs}
                t={t}
              />
            )}
            {activeTab === "products" && <ProductsTab products={products} unspsc={unspsc} t={t} />}
            {activeTab === "certs" && <CertsTab certs={certs} t={t} />}
            {activeTab === "procurement" && <ProcurementTab unspsc={unspsc} certs={certs} completeness={completeness} t={t} />}
            {activeTab === "overseas" && <OverseasTab country={country} t={t} />}
            {activeTab === "opportunities" && <OpportunitiesTab t={t} onUpgrade={handleUpgrade} />}
          </div>
        </div>
      </Modal>

      {/* 联系方式子弹窗 */}
      {contactModal && (
        <SupplierContactModal
          supplier={supplier}
          status={contactModal.status}
          contact={contactModal.contact}
          onClose={() => setContactModal(null)}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════
   空状态组件
   ═══════════════════════════════════════════ */

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-sm text-slate-400 font-medium">{message}</p>
      <p className="text-xs text-slate-300 mt-1">暂无数据</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Tab 面板组件
   ═══════════════════════════════════════════ */

interface TabPanelProps {
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** 信息行组件 */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="shrink-0 w-28 text-slate-400 font-medium text-xs leading-5">{label}</span>
      <span className="text-slate-800 font-bold text-xs leading-5">{value}</span>
    </div>
  );
}

/** 企业能力总览 */
function CapabilityTab({
  supplier, products, completeness, certs, t,
}: TabPanelProps & {
  supplier: Supplier;
  products: string[];
  completeness: number;
  certs: string[];
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
          <Building2 className="w-4 h-4 text-teal-600" />
        </span>
        {t("profile_capabilityTitle")}
      </h3>

      {/* 信息卡片 */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
        <InfoRow label={t("profile_companyScale")} value={supplier.companyType === "factory" ? t("supplierFactory") : t("supplierTrader")} />
        <InfoRow label={t("profile_mainProducts")} value={products.length > 0 ? products.join("、") : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_exportCountries")} value={supplier.countryZh || "—"} />
      </div>

      {/* 资料完整度 */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-500">{t("profile_dataCompleteness")}</span>
          <span className="text-sm font-extrabold text-teal-600">{completeness}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-200/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-500"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {/* 认证数量 + 标签 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 text-xs font-bold">
          <Award className="w-3.5 h-3.5" />
          {t("profile_certCount")} {certs.length} 项
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">
          <FileText className="w-3.5 h-3.5" />
          {t("profile_exportable")}
        </span>
      </div>

      {products.length === 0 && certs.length === 0 && completeness === 0 && (
        <EmptyState icon={Inbox} message="该企业暂未完善资料" />
      )}
    </div>
  );
}

/** 产品目录 */
function ProductsTab({ products, unspsc, t }: TabPanelProps & { products: string[]; unspsc: string }) {
  if (products.length === 0 && !unspsc) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
            <FileText className="w-4 h-4 text-teal-600" />
          </span>
          {t("profile_tabProducts")}
        </h3>
        <EmptyState icon={Inbox} message="该企业暂未录入产品信息" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
          <FileText className="w-4 h-4 text-teal-600" />
        </span>
        {t("profile_tabProducts")}
      </h3>
      {products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {products.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-white px-3.5 py-2.5 text-xs shadow-xs hover:border-teal-200 transition-colors">
              <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-2xs font-bold shrink-0">{i + 1}</span>
              <span className="text-slate-700 font-medium">{p}</span>
            </div>
          ))}
        </div>
      )}
      {unspsc && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
          <span className="text-xs font-bold text-blue-600">UNSPSC</span>
          <span className="text-xs font-mono text-blue-800">{unspsc}</span>
        </div>
      )}
    </div>
  );
}

/** 资质证书 */
function CertsTab({ certs, t }: TabPanelProps & { certs: string[] }) {
  if (certs.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
            <Award className="w-4 h-4 text-teal-600" />
          </span>
          {t("profile_tabCerts")}
        </h3>
        <EmptyState icon={Inbox} message="该企业暂未上传资质证书" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
          <Award className="w-4 h-4 text-teal-600" />
        </span>
        {t("profile_tabCerts")}
      </h3>
      <div className="flex flex-wrap gap-2">
        {certs.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-xs hover:shadow-md hover:border-teal-200 transition-shadow"
          >
            <Award className="w-3 h-3 text-teal-500" />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 公采适配 */
function ProcurementTab({ unspsc, certs, completeness, t }: TabPanelProps & { unspsc: string; certs: string[]; completeness: number }) {
  const unspscMatchPercent = unspsc ? 92 : 0;
  const rows: [string, ReactNode][] = [
    [t("profile_unspscMatch"), unspsc ? `${t("profile_unspscMatched")}（${unspscMatchPercent}%）` : <span className="text-slate-300">—</span>],
    [t("profile_complianceStandards"), certs.length > 0 ? certs.join(" / ") : <span className="text-slate-300">—</span>],
    [t("profile_qualificationPre"), completeness >= 80 ? t("profile_verified") : <span className="text-slate-300">—</span>],
    [t("profile_restrictionAssess"), completeness >= 70 ? "合规（低风险）" : <span className="text-slate-300">—</span>],
    [t("profile_docSupport"), completeness >= 60 ? "中英双语齐全" : <span className="text-slate-300">—</span>],
    [t("profile_suggestOptimize"), completeness < 90 ? "完善售后服务文件" : <span className="text-teal-600 font-bold">已完善</span>],
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <Globe className="w-4 h-4 text-blue-600" />
        </span>
        {t("profile_complianceTitle")}
      </h3>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
        {rows.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors">
          <Target className="w-3.5 h-3.5" />
          {t("profile_aiDiagnosis")}
        </button>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 transition-colors">
          <Lock className="w-3.5 h-3.5" />
          {t("profile_memberFunction")}
        </button>
      </div>
    </div>
  );
}

/** 海外展厅 */
function OverseasTab({ country, t }: TabPanelProps & { country: string }) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-teal-600" />
        </span>
        {t("profile_tabOverseas")}
      </h3>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
        <InfoRow label={t("profile_exportCountries")} value={country || <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_overseasNodes")} value={<span className="text-slate-300">—</span>} />
      </div>

      {country === "—" && (
        <EmptyState icon={Globe} message="该企业暂未设置海外信息" />
      )}
    </div>
  );
}

/** 商机匹配 + 推广权益 CTA */
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
      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
          <Crown className="w-4 h-4 text-amber-600" />
        </span>
        {t("profile_benefitsTitle")}
      </h3>

      {/* 权益列表 — 带锁图标渐变边框卡片 */}
      <div className="rounded-xl border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/30 p-4 space-y-1">
        {benefits.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 py-1.5">
            <span className="shrink-0 w-28 text-slate-400 font-medium text-xs leading-5">{label}</span>
            <span className="flex items-center gap-1.5 text-slate-800 font-bold text-xs leading-5">
              <Lock className="w-3 h-3 text-amber-400" />
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* 升级 CTA */}
      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-lg shadow-amber-200/40">
        <div>
          <p className="text-sm font-extrabold">{t("profile_supplierMember")}</p>
          <p className="text-xs text-amber-100 mt-0.5">解锁全部供应商推广权益</p>
        </div>
        <button
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-amber-700 text-xs font-extrabold hover:bg-amber-50 transition-colors shadow-sm"
        >
          {t("profile_upgradePlan")}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

SupplierProfileModal.displayName = "SupplierProfileModal";
