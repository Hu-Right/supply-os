/**
 * 供应商页面（模块05 设计图还原）— 拆分后主入口
 * Supplier Page — Module 05 Design Mockup
 *
 * @module features/supplier/pages/SupplierPage
 * @description 按「5-全球供应商库」样图重排：页头 + 统计墙 + 多Tab搜索面板 +
 *              热门搜索 + 结果头部（排序/视图切换）+ 供应商卡片网格/列表 + 加载更多。
 *              数据通过 useSupplierSearch Hook 走真实API，缺失展示字段用 mock 填充。
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Building2, MapPin, Briefcase } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import { onAppEvent } from "@/core/events";
import type { Supplier } from "@/types";
import { SupplierCard } from "../../components/SupplierCard";
import { SupplierCardSkeleton } from "../../components/SupplierCardSkeleton";
import { SupplierRegisterModal } from "../../components/SupplierRegisterModal";
import { SupplierContactModal, type SupplierContactStatus } from "@/shared/components/SupplierContactModal";
import { LoadingOverlay } from "@/shared/ui";
import { Button } from "@/shared/ui";
import { fetchSupplierContact, type SupplierContact } from "../../api";
import { useSupplierSearch } from "../../hooks/useSupplierSearch";
import { useSupplierStats } from "../../hooks/useSupplierStats";
import { useCountUp } from "../../hooks/useCountUp";

import { StatsWall } from "./StatsWall";
import { SearchPanel } from "./SearchPanel";
import { ResultHeader } from "./ResultHeader";

export default function SupplierPage() {
  const { t, locale } = useLocale();
  const { isVip } = useAuth();
  const userId = useUserId();
  const router = useRouter();

  // ── 搜索状态 ─
  const [searchTab, setSearchTab] = useState("product");
  const [searchTerm, setSearchTerm] = useState("");
  const [industry, setIndustry] = useState("");
  const [sortBy, setSortBy] = useState("comprehensive");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  // ── 通过 Hook 获取数据 ──
  const { suppliers, total, loading, industries, setPage, appendPage } = useSupplierSearch({
    locale,
    searchTerm,
    supplierSubTab: "all",
    supplierIndustry: industry,
    sortBy,
    pageSize: 8,
  });

  // ── 弹窗状态 ──
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [contactModal, setContactModal] = useState<{
    supplier: Supplier; status: SupplierContactStatus; contact: SupplierContact | null;
  } | null>(null);

  // ── 性能监控 ──
  const firstLoadDoneRef = useRef(false);
  useEffect(() => { markPageStart("supplier"); }, []);
  useEffect(() => {
    if (!firstLoadDoneRef.current && !loading && suppliers.length > 0) {
      firstLoadDoneRef.current = true;
      markPageEnd("supplier", suppliers.length);
    }
  }, [loading, suppliers.length]);
  useRenderTimer("SupplierPage", [loading, suppliers.length]);

  useEffect(() => {
    return onAppEvent("supply-os:open-supplier-register", () => setShowRegisterModal(true));
  }, []);

  // ── 操作处理 ──
  const handleAiMatch = (supplier: Supplier) => {
    try { sessionStorage.setItem("__route_state__", JSON.stringify({ aiMatchSupplier: supplier })); } catch {}
    router.push("/crm");
  };

  const handleContact = async (supplier: Supplier) => {
    if (!userId || !isVip) { setContactModal({ supplier, status: "vipOnly", contact: null }); return; }
    setContactModal({ supplier, status: "loading", contact: null });
    try {
      const contact = await fetchSupplierContact(supplier.id);
      setContactModal({ supplier, status: "success", contact });
    } catch { setContactModal({ supplier, status: "error", contact: null }); }
  };

  const handleSearch = () => { setPage(1); };
  const handleReset = () => { setSearchTerm(""); setIndustry(""); setPage(1); };

  // ── 统计墙：真实数据 + 数字动画 ─
  const realStats = useSupplierStats();
  const animSearchable = useCountUp(realStats.searchable);
  const animVerified = useCountUp(realStats.verified);
  const animUnspsc = useCountUp(realStats.unspscMatched);

  return (
    <div className="space-y-6">
      <LoadingOverlay visible={loading && firstLoadDoneRef.current} />

      <StatsWall
        stats={[
          { value: animSearchable, label: t("supplierStatSearchable") },
          { value: animVerified, label: t("supplierStatVerified") },
          { value: animUnspsc, label: t("supplierStatUnspsc") },
        ]}
        realtimeLabel={t("supplierStatRealtime")}
      />

      <SearchPanel
        searchTab={searchTab} setSearchTab={setSearchTab}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        industry={industry} setIndustry={setIndustry}
        industries={industries}
        onSearch={handleSearch} onReset={handleReset} t={t}
      />

      <ResultHeader
        total={total} sortBy={sortBy} setSortBy={setSortBy}
        viewMode={viewMode} setViewMode={setViewMode} t={t}
      />

      {/* ═══ 供应商展示区 ═══ */}
      {loading && suppliers.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <SupplierCardSkeleton key={i} />)}
        </div>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {suppliers.map((sup) => (
            <SupplierCard key={sup.id} supplier={sup}
              onAiMatch={handleAiMatch} onContact={handleContact} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((sup) => {
            const name = pickLocale(locale, sup.nameZh, sup.nameEn);
            const products = pickLocale(locale, sup.mainProductsZh, sup.mainProductsEn) ?? [];
            const certs = sup.certifications ?? [];
            const country = pickLocale(locale, sup.countryZh, sup.countryEn);
            const industryName = pickLocale(locale, sup.industryZh, sup.industryEn);
            return (
              <div key={sup.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <h4 className="text-sm font-extrabold text-slate-900 truncate">{name}</h4>
                    {sup.membershipTier && (
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-2xs font-bold text-white ${
                        sup.membershipTier === "gold" ? "bg-amber-500" :
                        sup.membershipTier === "recommended" ? "bg-rose-500" : "bg-teal-500"
                      }`}>
                        {sup.membershipTier === "gold" ? t("supplierGoldMember") :
                         sup.membershipTier === "recommended" ? t("supplierRecommended") : t("supplierCertifiedMember")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{country}</span>
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{industryName}</span>
                  </div>
                </div>
                <div className="sm:w-48 text-xs text-slate-600 truncate" title={products.join(", ")}>
                  <span className="font-bold text-slate-400">{t("supplierCoreProducts")}</span>
                  {products.slice(0, 3).join("、")}
                </div>
                <div className="sm:w-36 flex flex-wrap gap-1">
                  {certs.slice(0, 3).map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-2xs text-slate-600 font-medium">{c}</span>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button onClick={() => router.push(`/supplier/${sup.id}`)} variant="outline" size="sm"
                    className="text-xs font-bold text-slate-700 border-slate-300 hover:border-teal-400 hover:text-teal-700">
                    {t("supplierViewProfile")}
                  </Button>
                  <Button onClick={() => handleContact(sup)} variant="primary" size="sm" className="text-xs font-bold">
                    {t("supplierSendInquiry")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ 加载更多（追加模式） ═══ */}
      {!loading && suppliers.length > 0 && suppliers.length < total && (
        <div className="flex justify-center">
          <Button onClick={appendPage} variant="outline"
            className="gap-2 font-bold text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-700">
            {loading ? t("supplierContactLoading") : t("supplierLoadMore")}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ═══ 弹窗 ═══ */}
      {showRegisterModal && (
        <SupplierRegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={() => { setShowRegisterModal(false); }}
        />
      )}
      {contactModal && (
        <SupplierContactModal
          supplier={contactModal.supplier}
          status={contactModal.status}
          contact={contactModal.contact}
          onClose={() => setContactModal(null)}
        />
      )}
    </div>
  );
}

SupplierPage.displayName = "SupplierPage";
