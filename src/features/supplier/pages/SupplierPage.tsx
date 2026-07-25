/**
 * 供应商页面
 * Supplier Page
 *
 * @module features/supplier/pages/SupplierPage
 * @description 供应商页面入口，展示供应商列表和筛选
 *              Supplier page entry, displays supplier list and filters
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale, pickLocale } from "@/core/i18n";
import { SUPPLIERS } from "@/data";
import type { Supplier } from "@/types";
import { SupplierCard } from "../components/SupplierCard";
import { SupplierRegisterModal } from "../components/SupplierRegisterModal";
import { fetchCustomSuppliers } from "../api";

export default function SupplierPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierSubTab, setSupplierSubTab] = useState<"all" | "domestic" | "international">("all");
  const [supplierIndustry, setSupplierIndustry] = useState("");
  const [supplierUngmCodeSearch, setSupplierUngmCodeSearch] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [customSuppliers, setCustomSuppliers] = useState<Supplier[]>([]);

  // 拉取用户自助入驻的自定义供应商（失败静默回退到仅静态列表）
  const loadCustomSuppliers = useCallback(() => {
    fetchCustomSuppliers()
      .then((list) => setCustomSuppliers(Array.isArray(list) ? list : []))
      .catch(() => setCustomSuppliers([]));
  }, []);

  useEffect(() => {
    loadCustomSuppliers();
  }, [loadCustomSuppliers]);

  // 展示列表：自定义（pending）供应商排在静态目录之前
  const allSuppliers = useMemo(
    () => [...customSuppliers, ...SUPPLIERS],
    [customSuppliers]
  );

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

  const handleAiMatch = (supplier: Supplier) => {
    navigate("/crm");
  };

  const handleContact = (supplier: Supplier) => {
    alert(
      `联络人: ${supplier.contactPerson}\n邮箱: ${supplier.contactEmail}\n电话: ${supplier.contactPhone}`
    );
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
              onClick={() => setSupplierSubTab(s.id as "all" | "domestic" | "international")}
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
          />

          <select
            value={supplierIndustry}
            onChange={(e) => setSupplierIndustry(e.target.value)}
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
            onChange={(e) => setSupplierUngmCodeSearch(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            title="仅适用于国外供应商8位分类码匹配"
          />
        </div>

        <button
          onClick={() => setShowRegisterModal(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 md:w-auto"
        >
          <Store className="h-4 w-4" />
          {t("supplierRegOpenBtn")}
        </button>
      </div>

      {/* Suppliers Grid cards view */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredSuppliers.map((sup) => (
          <SupplierCard
            key={sup.id}
            supplier={sup}
            onAiMatch={handleAiMatch}
            onContact={handleContact}
          />
        ))}

        {filteredSuppliers.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            <p>{t("noData")}</p>
          </div>
        )}
      </div>

      {showRegisterModal && (
        <SupplierRegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={loadCustomSuppliers}
        />
      )}
    </div>
  );
}

SupplierPage.displayName = "SupplierPage";
