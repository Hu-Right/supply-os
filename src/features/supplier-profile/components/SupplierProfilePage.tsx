/**
 * 供应商企业主页（模块06 设计图还原 + 真实API对接）
 * Supplier Enterprise Profile Page — Module 06
 *
 * @module features/supplier-profile/components/SupplierProfilePage
 * @description 按「6-供应商企业主页」样图实现：Logo+公司名+标签+CTA +
 *              6 Tab 导航（按需渲染）+ 内容面板。
 *              数据优先走 GET /api/suppliers/:id，缺失字段用 mock 兜底。
 *              D4-1 拆分：6 个 Tab 面板提取至 ProfileTabPanels.tsx。
 */
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Building2, Globe, Send, MapPin,
} from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { Button, Badge, EmptyState } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { useSupplierProfile } from "../hooks/useSupplierProfile";
import { fetchSupplierContact, type SupplierContact } from "@/features/supplier/api";
import { SupplierContactModal, type SupplierContactStatus } from "@/features/supplier/components/SupplierContactModal";
import type { Supplier } from "@/types";
import {
  CapabilityPanel, ProductsPanel, CertsPanel,
  ProcurementPanel, OverseasPanel, OpportunitiesPanel,
} from "./ProfileTabPanels";

/* ─ Tab 定义 ── */
const PROFILE_TABS = [
  { key: "capability", labelKey: "profile_tabCapability", icon: Building2 },
  { key: "products", labelKey: "profile_tabProducts", icon: Building2 },
  { key: "certs", labelKey: "profile_tabCerts", icon: Building2 },
  { key: "procurement", labelKey: "profile_tabProcurement", icon: Globe },
  { key: "overseas", labelKey: "profile_tabOverseas", icon: Globe },
  { key: "opportunities", labelKey: "profile_tabOpportunities", icon: Globe },
] as const;

/* ═════════════════════════════════════════
   主组件
   ════════════════════════════════════════ */

export function SupplierProfilePage() {
  const { t, locale } = useLocale();
  const { isVip } = useAuth();
  const userId = useUserId();
  const params = useParams();
  const id = String(params?.id ?? "");

  const { supplier, loading } = useSupplierProfile(locale, id);

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

SupplierProfilePage.displayName = "SupplierProfilePage";
