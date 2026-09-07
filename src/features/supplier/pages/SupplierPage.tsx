/**
 * 供应商页面（模块05 设计图还原）
 * Supplier Page — Module 05 Design Mockup
 *
 * @module features/supplier/pages/SupplierPage
 * @description 按「5-全球供应商库」样图重排：页头 + 4格统计墙 + 多Tab搜索面板 +
 *              热门搜索 + 结果头部（排序/视图切换）+ 4列供应商卡片网格 + 加载更多。
 *              数据优先走 API，缺失字段用静态 mock 数据占位。
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, LayoutGrid, List, ChevronDown, Heart, Building2 } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import { api } from "@/core/http";
import { onAppEvent } from "@/core/events";
import type { Supplier } from "@/types";
import { SupplierCard } from "../components/SupplierCard";
import { SupplierCardSkeleton } from "../components/SupplierCardSkeleton";
import { SupplierRegisterModal } from "../components/SupplierRegisterModal";
import { SupplierContactModal, type SupplierContactStatus } from "../components/SupplierContactModal";
import { LoadingOverlay } from "@/shared/ui";
import { Input, Select, Button } from "@/shared/ui";
import { fetchSupplierContact, type SupplierContact } from "../api";
import { getCountryDisplayName } from "@/shared/data/countryNames";

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

/** 热门搜索标签（静态数据） */
const HOT_SEARCHES = [
  "医疗器械", "光伏组件", "工程机械", "电力设备",
  "阀门", "新能源", "LED照明", "不锈钢管材",
];

/** 静态 Mock 供应商数据（API 缺失字段时兜底） */
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

export default function SupplierPage() {
  const { t, locale } = useLocale();
  const { authUser, isVip } = useAuth();
  const userId = useUserId();
  const router = useRouter();

  // ── 搜索状态 ──
  const [searchTab, setSearchTab] = useState("product");
  const [searchTerm, setSearchTerm] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [certification, setCertification] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [sortBy, setSortBy] = useState("comprehensive");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  // ── 数据状态 ──
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [industries, setIndustries] = useState<string[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [contactModal, setContactModal] = useState<{
    supplier: Supplier; status: SupplierContactStatus; contact: SupplierContact | null;
  } | null>(null);

  // ── 统计墙数据（优先 API，回退静态值） ──
  const [stats, setStats] = useState({ searchable: 0, registered: 0, verified: 0, unspsc: 0 });
  useEffect(() => {
    api<{ searchable?: number; registered?: number; verified?: number; unspsc?: number }>("/api/suppliers/stats")
      .then((d) => setStats({
        searchable: d.searchable ?? 1245678,
        registered: d.registered ?? 32567,
        verified: d.verified ?? 18934,
        unspsc: d.unspsc ?? 16872,
      }))
      .catch(() => setStats({ searchable: 1245678, registered: 32567, verified: 18934, unspsc: 16872 }));
  }, []);

  // ── 加载供应商数据 ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ lang: locale, page: String(page), pageSize: "8" });
    if (searchTerm) params.set("q", searchTerm);
    if (country) params.set("country", country);
    if (industry) params.set("industry", industry);
    if (companyType) params.set("type", companyType);

    api<{ items: Supplier[]; total: number }>(`/api/suppliers?${params.toString()}`)
      .then((result) => {
        if (cancelled) return;
        // 补充 mock 字段（API 可能不返回新字段）
        const enriched = result.items.map((s, i) => {
          const mock = createMockSuppliers(8)[i % 8];
          return {
            ...s,
            companyType: s.companyType || mock.companyType,
            membershipTier: s.membershipTier || mock.membershipTier,
            dataCompleteness: s.dataCompleteness ?? mock.dataCompleteness,
            unspscCode: s.unspscCode || s.ungmCode || mock.unspscCode,
            certifications: s.certifications || mock.certifications,
            capabilityTags: s.capabilityTags || mock.capabilityTags,
          } as Supplier;
        });
        setSuppliers(enriched);
        setTotal(result.total || 120568);
      })
      .catch(() => {
        if (cancelled) return;
        // API 失败时使用 mock 数据
        setSuppliers(createMockSuppliers(8));
        setTotal(120568);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [locale, page, searchTerm, country, industry, companyType]);

  // ── 加载行业列表 ──
  useEffect(() => {
    api<Supplier[]>(`/api/suppliers?lang=${locale}`)
      .then((list) => {
        const set = new Set<string>();
        (Array.isArray(list) ? list : []).forEach((s) => {
          const ind = pickLocale(locale, s.industryZh, s.industryEn);
          if (ind) set.add(ind);
        });
        setIndustries(Array.from(set));
      })
      .catch(() => {});
  }, [locale]);

  // ─ 性能监控 ──
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
  const handleReset = () => {
    setSearchTerm(""); setCountry(""); setIndustry("");
    setCertification(""); setCompanyType(""); setPage(1);
  };

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

      {/* ═══ 4格统计墙（独立白色区域） ═══ */}
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
        {/* Tab 选择（下划线高亮风格） */}
        <div className="flex items-center gap-4 border-b border-slate-200 pb-0">
          <span className="text-sm font-bold text-slate-500 shrink-0">{t("supplierSearchTab")}</span>
          {SEARCH_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSearchTab(tab.key)}
              className={`pb-2.5 text-sm font-bold transition-colors border-b-2 ${
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_auto_auto_auto_auto_auto] gap-3 items-end">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("supplierSearchPlaceholder2")}
            className="w-full"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 outline-none min-w-[130px]"
          >
            <option value="">{t("supplierSelectCountry")}</option>
            <option value="CN">中国</option>
            <option value="US">美国</option>
            <option value="DE">德国</option>
            <option value="JP">日本</option>
          </select>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 outline-none min-w-[130px]"
          >
            <option value="">{t("supplierSelectIndustry")}</option>
            {industries.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
          </select>
          <select
            value={certification}
            onChange={(e) => setCertification(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 outline-none min-w-[130px]"
          >
            <option value="">{t("supplierSelectCertification")}</option>
            <option value="ISO9001">ISO 9001</option>
            <option value="CE">CE</option>
            <option value="FDA">FDA</option>
            <option value="TUV">TÜV</option>
          </select>
          <select
            value={companyType}
            onChange={(e) => setCompanyType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-teal-400 outline-none min-w-[120px]"
          >
            <option value="">{t("supplierSelectAllTypes")}</option>
            <option value="factory">{t("supplierFactory")}</option>
            <option value="trader">{t("supplierTrader")}</option>
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

        {/* 热门搜索 */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-500">{t("supplierHotSearch")}</span>
          {HOT_SEARCHES.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => { setSearchTerm(tag); setPage(1); }}
              className="px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-700 transition-colors"
            >
              {tag}
            </button>
          ))}
          <span className="text-slate-400 ml-auto cursor-pointer hover:text-teal-600 font-medium">
            {t("supplierMoreFilters")} <SlidersHorizontal className="w-3.5 h-3.5 inline" />
          </span>
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

      {/* ═══ 供应商网格 ═══ */}
      {loading && suppliers.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <SupplierCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {suppliers.map((sup) => (
            <SupplierCard
              key={sup.id}
              supplier={sup}
              onAiMatch={handleAiMatch}
              onContact={handleContact}
            />
          ))}
        </div>
      )}

      {/* ══ 加载更多 ═══ */}
      {!loading && suppliers.length > 0 && (
        <div className="flex justify-center">
          <Button
            onClick={() => setPage((p) => p + 1)}
            variant="outline"
            className="gap-2 font-bold text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-700"
          >
            {t("supplierLoadMore")}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ═══ 弹窗 ═══ */}
      {showRegisterModal && (
        <SupplierRegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={() => { setShowRegisterModal(false); setPage(1); }}
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
