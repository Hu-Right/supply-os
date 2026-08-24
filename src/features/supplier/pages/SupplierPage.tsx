/**
 * 供应商页面
 * Supplier Page
 *
 * @module features/supplier/pages/SupplierPage
 * @description 供应商页面入口，展示供应商列表和筛选
 *              Supplier page entry, displays supplier list and filters
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale, pickLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { markPageStart, markPageEnd, useRenderTimer } from "@/core/perf";
import type { Supplier } from "@/types";
import { SupplierCard } from "../components/SupplierCard";
import { SupplierCardSkeleton } from "../components/SupplierCardSkeleton";
import { SupplierRegisterModal } from "../components/SupplierRegisterModal";
import { SupplierContactModal, type SupplierContactStatus } from "../components/SupplierContactModal";
import { Pagination, LoadingOverlay } from "@/shared/ui";
import { Input, Select } from "@/shared/ui";
import { PAGE_SIZE } from "@/features/procurement/constants";
import { fetchSuppliersPaginated, fetchSuppliers, fetchSupplierContact, type SupplierContact } from "../api";
import { onAppEvent } from "@/core/events";

export default function SupplierPage() {
  const { t, locale } = useLocale();
  const { authUser, isVip } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierSubTab, setSupplierSubTab] = useState<"all" | "domestic" | "international">("all");
  const [supplierIndustry, setSupplierIndustry] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  // 联络弹窗状态
  const [contactModal, setContactModal] = useState<{
    supplier: Supplier;
    status: SupplierContactStatus;
    contact: SupplierContact | null;
  } | null>(null);
  // ── 服务端分页状态 ──
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  // 行业下拉选项（独立加载，不阻塞首屏骨架屏）
  const [industries, setIndustries] = useState<string[]>([]);

  // ── 性能监控：首屏计时 ──
  const firstLoadDoneRef = useRef(false);
  useEffect(() => {
    markPageStart("supplier");
  }, []);
  useEffect(() => {
    if (!firstLoadDoneRef.current && !loading && suppliers.length > 0) {
      firstLoadDoneRef.current = true;
      markPageEnd("supplier", suppliers.length);
    }
  }, [loading, suppliers.length]);
  useRenderTimer("SupplierPage", [loading, suppliers.length]);

  // ── 加载行业列表（用于筛选下拉，独立于分页数据，不阻塞骨架屏） ──
  useEffect(() => {
    let cancelled = false;
    fetchSuppliers(locale)
      .then((list) => {
        if (cancelled) return;
        const set = new Set<string>();
        (Array.isArray(list) ? list : []).forEach((s) => {
          const ind = pickLocale(locale, s.industryZh, s.industryEn);
          if (ind) set.add(ind);
        });
        setIndustries(Array.from(set));
      })
      .catch(() => { /* 静默：下拉保持空 */ });
    return () => { cancelled = true; };
  }, [locale]);

  // ── 服务端分页加载 ──
  const loadSuppliers = useCallback(() => {
    setLoading(true);
    fetchSuppliersPaginated(locale, {
      page,
      pageSize: PAGE_SIZE,
      q: searchTerm || undefined,
      type: supplierSubTab !== "all" ? supplierSubTab : undefined,
      industry: supplierIndustry || undefined,
    })
      .then((result) => {
        setSuppliers(result.items);
        setTotal(result.total);
      })
      .catch(() => {
        setSuppliers([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [locale, page, searchTerm, supplierSubTab, supplierIndustry]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // 监听页头横幅"注册成为认证供应商"事件，打开入驻表单
  useEffect(() => {
    return onAppEvent("supply-os:open-supplier-register", () => setShowRegisterModal(true));
  }, []);

  // 服务端分页：total 即筛选后总数
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        {/* shrink-0：筛选标签不因右侧搜索区变宽被挤压变形 */}
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-1">
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

        {/* md:max-w-xl 取代 md:w-auto：容器宽度受限三列等分，
            不再被 UNSPSC 长 placeholder 的固有宽度撑开 */}
        <div className="grid w-full grid-cols-2 gap-2 md:max-w-xl md:grid-cols-3">
          <Input
            type="text"
            placeholder={t("searchSupplierPlaceholder")}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="min-w-0 px-3 py-1.5 text-xs"
          />

          <Select
            value={supplierIndustry}
            onChange={(e) => {
              setSupplierIndustry(e.target.value);
              setPage(1);
            }}
            className="min-w-0 px-3 py-1.5 text-xs"
          >
            <option value="">{t("allIndustries")}</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 语言切换等后续操作：全屏蒙层阻断交互；首次加载用骨架屏 */}
      <LoadingOverlay visible={loading && firstLoadDoneRef.current} />

      {/* Suppliers Grid cards view */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 首次加载：骨架屏数量对齐 PAGE_SIZE */}
        {loading && !firstLoadDoneRef.current &&
          Array.from({ length: PAGE_SIZE }, (_, idx) => <SupplierCardSkeleton key={idx} />)}

        {!loading &&
          suppliers.map((sup) => (
            <SupplierCard
              key={sup.id}
              supplier={sup}
              onAiMatch={handleAiMatch}
              onContact={handleContact}
            />
          ))}

        {!loading && total === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            <p>{t("noData")}</p>
          </div>
        )}
      </div>

      {/* 分页控件：复用公采页同款（每页 9 条） */}
      {!loading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          serverPageSize={PAGE_SIZE}
          total={total}
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
