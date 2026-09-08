/**
 * 供应商页面（模块05 设计图还原）
 * Supplier Page — Module 05 Design Mockup
 *
 * @module features/supplier/pages/SupplierPage
 * @description 按「5-全球供应商库」样图重排：页头 + 统计墙 + 多Tab搜索面板 +
 *              热门搜索 + 结果头部（排序/视图切换）+ 供应商卡片网格/列表 + 加载更多。
 *              数据通过 useSupplierSearch Hook 走真实API，缺失展示字段用 mock 填充。
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, LayoutGrid, List, ChevronDown, Building2, MapPin, Briefcase } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import { onAppEvent } from "@/core/events";
import type { Supplier } from "@/types";
import { SupplierCard } from "../components/SupplierCard";
import { SupplierCardSkeleton } from "../components/SupplierCardSkeleton";
import { SupplierRegisterModal } from "../components/SupplierRegisterModal";
import { SupplierContactModal, type SupplierContactStatus } from "../components/SupplierContactModal";
import { SupplierProfileModal } from "../components/SupplierProfileModal";
import { LoadingOverlay } from "@/shared/ui";
import { Input, Button } from "@/shared/ui";
import { fetchSupplierContact, type SupplierContact } from "../api";
import { useSupplierSearch } from "../hooks/useSupplierSearch";

/** 搜索 Tab 定义 */
const SEARCH_TABS = [
  { key: "product", labelKey: "supplierTabProduct" },
  { key: "company", labelKey: "supplierTabCompany" },
  { key: "country", labelKey: "supplierTabCountry" },
  { key: "industry", labelKey: "supplierTabIndustry" },
  { key: "certification", labelKey: "supplierTabCertification" },
  { key: "factory", labelKey: "supplierTabFactory" },
  { key: "unspsc", labelKey: "supplierTabUnspsc" },
] as const;

/** 排序选项 */
const SORT_OPTIONS = [
  { value: "comprehensive", labelKey: "supplierSortComprehensive" },
  { value: "match", labelKey: "supplierSortMatch" },
  { value: "newest", labelKey: "supplierSortNewest" },
  { value: "certified", labelKey: "supplierSortCertified" },
  { value: "completeness", labelKey: "supplierSortCompleteness" },
] as const;

/** 静态 Mock 供应商数据（API 缺失展示字段时兜底填充） */
function createMockSuppliers(count: number): Supplier[] {
  const mockData: Array<Partial<Supplier> & { nameZh: string; nameEn: string }> = [
    { nameZh: "华东新能源制造有限公司", nameEn: "Huadong New Energy Mfg Co.", companyType: "factory", membershipTier: "certified", dataCompleteness: 95, unspscCode: "40101500", certifications: ["ISO 9001", "CE", "TÜV"], capabilityTags: ["准时交付 98%", "24h响应", "可定制"], mainProductsZh: ["光伏组件", "逆变器", "储能系统"], mainProductsEn: ["Solar Panels", "Inverters", "Energy Storage"] },
    { nameZh: "精密医疗器械工厂", nameEn: "Precision Medical Device Factory", companyType: "factory", membershipTier: "gold", dataCompleteness: 92, unspscCode: "42295100", certifications: ["ISO 13485", "CE", "FDA"], capabilityTags: ["准时交付 97%", "无尘车间", "出口检验"], mainProductsZh: ["手术器械", "耗材", "监护设备"], mainProductsEn: ["Surgical Instruments", "Consumables", "Monitors"] },
    { nameZh: "工程机械供应商有限公司", nameEn: "Construction Machinery Supplier Ltd", companyType: "trader", membershipTier: "recommended", dataCompleteness: 88, unspscCode: "22101500", certifications: ["ISO 9001", "CE"], capabilityTags: ["准时交付 96%", "备件充足", "全球服务"], mainProductsZh: ["挖掘机", "装载机", "配件"], mainProductsEn: ["Excavators", "Loaders", "Parts"] },
    { nameZh: "工业泵阀制造有限公司", nameEn: "Industrial Pump & Valve Mfg Co.", companyType: "factory", membershipTier: "certified", dataCompleteness: 91, unspscCode: "40141600", certifications: ["ISO 9001", "API", "CE"], capabilityTags: ["准时交付 97%", "质检严格", "支持定制"], mainProductsZh: ["工业泵", "阀门", "管件"], mainProductsEn: ["Industrial Pumps", "Valves", "Fittings"] },
    { nameZh: "LED照明科技有限公司", nameEn: "LED Lighting Technology Co.", companyType: "factory", membershipTier: "certified", dataCompleteness: 89, unspscCode: "39111600", certifications: ["ISO 9001", "CE", "RoHS"], capabilityTags: ["准时交付 95%", "研发能力强", "出口经验"], mainProductsZh: ["LED灯具", "驱动电源"], mainProductsEn: ["LED Fixtures", "Drivers"] },
    { nameZh: "不锈钢材料有限公司", nameEn: "Stainless Steel Materials Co.", companyType: "trader", membershipTier: "certified", dataCompleteness: 86, unspscCode: "30101700", certifications: ["ISO 9001"], capabilityTags: ["准时交付 94%", "现货充足", "切割加工"], mainProductsZh: ["不锈钢板", "管材", "型材"], mainProductsEn: ["SS Sheets", "Pipes", "Profiles"] },
    { nameZh: "电力设备制造有限公司", nameEn: "Power Equipment Mfg Co.", companyType: "factory", membershipTier: "certified", dataCompleteness: 93, unspscCode: "39121000", certifications: ["ISO 9001", "CE", "CCC"], capabilityTags: ["准时交付 98%", "高压试验", "质保2年"], mainProductsZh: ["变压器", "开关柜", "配电箱"], mainProductsEn: ["Transformers", "Switchgear", "Distribution Boxes"] },
    { nameZh: "化工原料供应商", nameEn: "Chemical Raw Materials Supplier", companyType: "trader", membershipTier: "certified", dataCompleteness: 87, unspscCode: "12162000", certifications: ["ISO 9001"], capabilityTags: ["准时交付 95%", "MSDS齐全", "危险品资质"], mainProductsZh: ["化工原料", "助剂", "溶剂"], mainProductsEn: ["Chemical Raw Materials", "Additives", "Solvents"] },
  ];

  return Array.from({ length: count }, (_, i) => {
    const base = mockData[i % mockData.length];
    return {
      id: `mock-${i}`,
      nameZh: base.nameZh!,
      nameEn: base.nameEn!,
      type: (base.companyType === "trader" ? "international" : "domestic") as "domestic" | "international",
      industryZh: "制造业",
      industryEn: "Manufacturing",
      countryZh: "中国",
      countryEn: "China",
      cityZh: "上海",
      cityEn: "Shanghai",
      mainProductsZh: base.mainProductsZh || ["核心产品"],
      mainProductsEn: base.mainProductsEn || ["Core Product"],
      complianceLabelsZh: [],
      complianceLabelsEn: [],
      contactPerson: "联系人",
      contactEmail: "contact@example.com",
      contactPhone: "+86-21-00000000",
      status: "approved" as const,
      companyType: base.companyType,
      membershipTier: base.membershipTier,
      dataCompleteness: base.dataCompleteness,
      unspscCode: base.unspscCode,
      certifications: base.certifications,
      capabilityTags: base.capabilityTags,
    } as Supplier;
  });
}

/** 用 mock 数据补全真实 API 返回中缺失的展示字段 */
function enrichWithMock(items: Supplier[]): Supplier[] {
  const mocks = createMockSuppliers(items.length);
  return items.map((s, i) => {
    const mock = mocks[i % mocks.length];
    return {
      ...s,
      companyType: s.companyType || mock.companyType,
      membershipTier: s.membershipTier || mock.membershipTier,
      dataCompleteness: s.dataCompleteness ?? mock.dataCompleteness,
      unspscCode: s.unspscCode || s.ungmCode || mock.unspscCode,
      certifications: s.certifications?.length ? s.certifications : mock.certifications,
      capabilityTags: s.capabilityTags?.length ? s.capabilityTags : mock.capabilityTags,
    } as Supplier;
  });
}

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
  const { suppliers: rawSuppliers, total, loading, industries, page, setPage, appendPage } = useSupplierSearch({
    locale,
    searchTerm,
    supplierSubTab: "all",
    supplierIndustry: industry,
    sortBy,
    pageSize: 8,
  });

  // ─ Mock 字段补全 ──
  const suppliers = useMemo(() => enrichWithMock(rawSuppliers), [rawSuppliers]);

  // ── 弹窗状态 ──
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [profileModalSupplier, setProfileModalSupplier] = useState<Supplier | null>(null);
  const [contactModal, setContactModal] = useState<{
    supplier: Supplier; status: SupplierContactStatus; contact: SupplierContact | null;
  } | null>(null);

  //  性能监控 ──
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
  const handleViewProfile = (supplier: Supplier) => {
    setProfileModalSupplier(supplier);
  };

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
  const handleReset = () => {
    setSearchTerm(""); setIndustry(""); setPage(1);
  };

  // ── 统计墙：使用真实 total，其余保留设计稿静态值 ──
  const stats = useMemo(() => ({
    searchable: total,
    registered: 32567,
    verified: 18934,
    unspsc: 16872,
  }), [total]);

  return (
    <div className="space-y-6">
      <LoadingOverlay visible={loading && firstLoadDoneRef.current} />

      {/* ═══ 深色页头 ══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-6">
        <h2 className="text-xl md:text-2xl font-extrabold text-white">
          {t("supplierPageTitle")}
          <span className="text-base font-bold text-slate-300 ml-2">|</span>
          <span className="text-base font-bold text-slate-300 ml-2">{t("supplierPageSubtitle")}</span>
        </h2>
        <p className="text-slate-400 text-xs mt-2">{t("supplierPageDesc")}</p>
      </section>

      {/* ═══ 统计墙 ═══ */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: stats.searchable, label: t("supplierStatSearchable") },
          { value: stats.registered, label: t("supplierStatRegistered") },
          { value: stats.verified, label: t("supplierStatVerified") },
          { value: stats.unspsc, label: t("supplierStatUnspsc") },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white border border-slate-200 px-5 py-4 shadow-xs text-center">
            <p className="text-xs text-slate-400 font-bold">[{t("supplierStatRealtime")}]</p>
            <p className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">{s.value.toLocaleString()}+</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ═══ 搜索面板 ═══ */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        {/* Tab 选择 */}
        <div className="flex items-center gap-4 border-b border-slate-200 pb-0 overflow-x-auto">
          <span className="text-sm font-bold text-slate-500 shrink-0">{t("supplierSearchTab")}</span>
          {SEARCH_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSearchTab(tab.key)}
              className={`pb-2.5 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
                searchTab === tab.key
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* 筛选行 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_auto_auto_auto] gap-3 items-end">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("supplierSearchPlaceholder2")}
            className="w-full"
          />
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 outline-none min-w-[130px]"
          >
            <option value="">{t("supplierSelectIndustry")}</option>
            {industries.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
          </select>
          <div className="flex items-end gap-2">
            <Button onClick={handleSearch} variant="primary" className="font-black whitespace-nowrap px-5">
              <Search className="w-4 h-4 mr-1" />
              {t("supplierSearchBtn")}
            </Button>
            <Button onClick={handleReset} variant="ghost" className="text-slate-500 whitespace-nowrap">
              {t("supplierResetBtn")}
            </Button>
          </div>
        </div>

      </section>

      {/* ═══ 结果头部 ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm font-bold text-slate-700">
          {t("supplierFound", { count: total.toLocaleString() })}
        </p>
        <div className="flex items-center gap-3">
          {/* 排序 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 focus:border-teal-400 outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
          {/* 视图切换 */}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              className={`p-1.5 ${viewMode === "card" ? "bg-teal-50 text-teal-700" : "bg-white text-slate-400"}`}
              aria-label={t("supplierCardView")}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 ${viewMode === "list" ? "bg-teal-50 text-teal-700" : "bg-white text-slate-400"}`}
              aria-label={t("supplierListView")}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 供应商展示区 ═══ */}
      {loading && suppliers.length === 0 ? (
        /* 骨架屏 */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <SupplierCardSkeleton key={i} />)}
        </div>
      ) : viewMode === "card" ? (
        /* 卡片视图 */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {suppliers.map((sup) => (
            <SupplierCard
              key={sup.id}
              supplier={sup}
              onAiMatch={handleAiMatch}
              onContact={handleContact}
              onViewProfile={handleViewProfile}
            />
          ))}
        </div>
      ) : (
        /* 列表视图 */
        <div className="space-y-3">
          {suppliers.map((sup) => {
            const name = pickLocale(locale, sup.nameZh, sup.nameEn);
            const products = pickLocale(locale, sup.mainProductsZh, sup.mainProductsEn) ?? [];
            const certs = sup.certifications ?? [];
            const country = pickLocale(locale, sup.countryZh, sup.countryEn);
            const industryName = pickLocale(locale, sup.industryZh, sup.industryEn);
            return (
              <div
                key={sup.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 transition-colors"
              >
                {/* 公司名 + 类型 */}
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
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{country}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />{industryName}
                    </span>
                  </div>
                </div>

                {/* 核心产品 */}
                <div className="sm:w-48 text-xs text-slate-600 truncate" title={products.join(", ")}>
                  <span className="font-bold text-slate-400">{t("supplierCoreProducts")}</span>
                  {products.slice(0, 3).join("、")}
                </div>

                {/* 认证标签 */}
                <div className="sm:w-36 flex flex-wrap gap-1">
                  {certs.slice(0, 3).map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-2xs text-slate-600 font-medium">{c}</span>
                  ))}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={() => handleViewProfile(sup)}
                    variant="outline"
                    size="sm"
                    className="text-xs font-bold text-slate-700 border-slate-300 hover:border-teal-400 hover:text-teal-700"
                  >
                    {t("supplierViewProfile")}
                  </Button>
                  <Button
                    onClick={() => handleContact(sup)}
                    variant="primary"
                    size="sm"
                    className="text-xs font-bold"
                  >
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
          <Button
            onClick={appendPage}
            variant="outline"
            className="gap-2 font-bold text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-700"
          >
            {loading ? t("supplierContactLoading") : t("supplierLoadMore")}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ═══ 弹窗 ═══ */}
      {profileModalSupplier && (
        <SupplierProfileModal
          supplier={profileModalSupplier}
          open={true}
          onClose={() => setProfileModalSupplier(null)}
        />
      )}
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
