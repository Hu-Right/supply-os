/**
 * 供应商页面
 * Supplier Page
 *
 * @module features/supplier/pages/SupplierPage
 * @description 供应商页面入口，展示供应商列表和筛选
 *              Supplier page entry, displays supplier list and filters
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import type { Supplier } from "@/types";
import { SupplierCard } from "../components/SupplierCard";
import { SupplierCardSkeleton } from "../components/SupplierCardSkeleton";
import { SupplierRegisterModal } from "../components/SupplierRegisterModal";
import { SupplierContactModal, type SupplierContactStatus } from "../components/SupplierContactModal";
import { ProcurementPagination } from "@/features/procurement/components/ProcurementPagination";
import { fetchSuppliers, fetchSupplierContact, type SupplierContact } from "../api";

// 与公采页保持一致的每页条数（3 列网格 × 3 行）
const PAGE_SIZE = 9;

export default function SupplierPage() {
  const { t, locale } = useLocale();
  const { authUser, isVip } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierSubTab, setSupplierSubTab] = useState<"all" | "domestic" | "international">("all");
  const [supplierIndustry, setSupplierIndustry] = useState("");
  const [supplierUngmCodeSearch, setSupplierUngmCodeSearch] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  // 联络弹窗状态：null 表示关闭（替代原生 alert 的自定义弹窗）
  const [contactModal, setContactModal] = useState<{
    supplier: Supplier;
    status: SupplierContactStatus;
    contact: SupplierContact | null;
  } | null>(null);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  // 首次挂载即处于加载中：渲染骨架屏而非空状态
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // 拉取 DB 供应商目录（按界面语言返回译文，失败显示空状态）
  const loadSuppliers = useCallback(() => {
    setLoading(true);
    setPage(1);
    fetchSuppliers(locale)
      .then((list) => setAllSuppliers(Array.isArray(list) ? list : []))
      .catch(() => setAllSuppliers([]))
      .finally(() => setLoading(false));
  }, [locale]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // 监听页头横幅"注册成为认证供应商"事件，打开入驻表单
  useEffect(() => {
    const onOpenRegister = () => setShowRegisterModal(true);
    window.addEventListener("supply-os:open-supplier-register", onOpenRegister);
    return () => window.removeEventListener("supply-os:open-supplier-register", onOpenRegister);
  }, []);

  // 计算可用行业
  const availableSupplierIndustries = useMemo(() => {
    const industries = new Set<string>();
    allSuppliers.forEach((s) => {
      const ind = pickLocale(locale, s.industryZh, s.industryEn);
      if (ind) industries.add(ind);
    });
    return Array.from(industries);
  }, [locale, allSuppliers]);

  // 筛选供应商
  const filteredSuppliers = useMemo(() => {
    return allSuppliers.filter((sup) => {
      const name = pickLocale(locale, sup.nameZh, sup.nameEn);
      const matchesSearch =
        !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubTab = supplierSubTab === "all" || sup.type === supplierSubTab;
      const matchesIndustry =
        !supplierIndustry ||
        pickLocale(locale, sup.industryZh, sup.industryEn) === supplierIndustry;
      const matchesUngmCode =
        !supplierUngmCodeSearch ||
        (sup.ungmCode && sup.ungmCode.includes(supplierUngmCodeSearch));

      return matchesSearch && matchesSubTab && matchesIndustry && matchesUngmCode;
    });
  }, [allSuppliers, locale, searchTerm, supplierSubTab, supplierIndustry, supplierUngmCodeSearch]);

  // 前端分页（数据一次拉全量，与公采页控件同款交互）
  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / PAGE_SIZE));
  const pagedSuppliers = useMemo(
    () => filteredSuppliers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredSuppliers, page]
  );

  const handleAiMatch = (supplier: Supplier) => {
    // 对齐原版：带上目标供应商跳转 CRM，由 CRM 页自动执行 AI 撮合
    navigate("/crm", { state: { aiMatchSupplier: supplier } });
  };

  // 联系方式为 VIP 专属：命中门槛后向后端请求明文（列表数据为掩码）
  const handleContact = async (supplier: Supplier) => {
    if (!authUser?.user_key || !isVip) {
      setContactModal({ supplier, status: "vipOnly", contact: null });
      return;
    }
    // 弹窗先开（加载态），数据到达后原地切换，避免点击后无反馈
    setContactModal({ supplier, status: "loading", contact: null });
    try {
      const contact = await fetchSupplierContact(supplier.id, authUser.user_key);
      setContactModal({ supplier, status: "success", contact });
    } catch {
      setContactModal({ supplier, status: "error", contact: null });
    }
  };

  return (
    <div className="space-y-6">
      {/* Inline Toggle Filter tabs for Suppliers */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs md:flex-row">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {[
            { id: "all", label: t("supplierFilterAll") },
            { id: "domestic", label: t("supplierFilterDomestic") },
            { id: "international", label: t("supplierFilterIntl") },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSupplierSubTab(s.id as "all" | "domestic" | "international");
                setPage(1);
              }}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-xs font-semibold ${supplierSubTab === s.id
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:grid-cols-3">
          <input
            type="text"
            placeholder={t("searchSupplierPlaceholder")}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
          />

          <select
            value={supplierIndustry}
            onChange={(e) => {
              setSupplierIndustry(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
          >
            <option value="">{t("allIndustries")}</option>
            {availableSupplierIndustries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder={t("searchUnspscPlaceholder")}
            value={supplierUngmCodeSearch}
            onChange={(e) => {
              setSupplierUngmCodeSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            title="仅适用于国外供应商8位分类码匹配"
          />
        </div>
      </div>

      {/* Suppliers Grid cards view */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: PAGE_SIZE }, (_, idx) => <SupplierCardSkeleton key={idx} />)}

        {!loading &&
          pagedSuppliers.map((sup) => (
            <SupplierCard
              key={sup.id}
              supplier={sup}
              onAiMatch={handleAiMatch}
              onContact={handleContact}
            />
          ))}

        {!loading && filteredSuppliers.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            <p>{t("noData")}</p>
          </div>
        )}
      </div>

      {/* 分页控件：复用公采页同款（每页 9 条） */}
      {!loading && filteredSuppliers.length > 0 && (
        <ProcurementPagination
          page={page}
          totalPages={totalPages}
          serverPageSize={PAGE_SIZE}
          total={filteredSuppliers.length}
          loading={loading}
          onPageChange={setPage}
        />
      )}

      {showRegisterModal && (
        <SupplierRegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={loadSuppliers}
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
