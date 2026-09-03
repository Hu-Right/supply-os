/**
 * 供应商搜索分页 Hook（架构评估 C5：补齐 supplier 的 hooks 层）
 *
 * @module features/supplier/hooks/useSupplierSearch
 * @description 承载原 SupplierPage 内联的数据获取：服务端分页列表 +
 *              行业下拉选项（独立加载，不阻塞骨架屏）。页面组件只消费状态。
 */
import { useEffect, useState } from "react";
import { pickLocale } from "@/core/i18n";
import { PAGE_SIZE } from "@/shared/constants";
import type { Supplier } from "@/types";
import { fetchSuppliersPaginated, fetchSuppliers } from "../api";

export interface SupplierSearchFilters {
  /** useLocale() 返回的 locale 对象（含 locale 字段与翻译键类型） */
  locale: ReturnType<typeof import("@/core/i18n").useLocale>["locale"];
  searchTerm: string;
  supplierSubTab: "all" | "domestic" | "international";
  supplierIndustry: string;
}

export function useSupplierSearch({ locale, searchTerm, supplierSubTab, supplierIndustry }: SupplierSearchFilters) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  // 行业下拉选项（独立加载，不阻塞首屏骨架屏）
  const [industries, setIndustries] = useState<string[]>([]);
  // 手动刷新（页面刷新按钮）触发器
  const [reloadKey, setReloadKey] = useState(0);

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
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSuppliersPaginated(locale, {
      page,
      pageSize: PAGE_SIZE,
      q: searchTerm || undefined,
      type: supplierSubTab !== "all" ? supplierSubTab : undefined,
      industry: supplierIndustry || undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setSuppliers(result.items);
        setTotal(result.total);
      })
      .catch(() => {
        if (cancelled) return;
        setSuppliers([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [locale, page, searchTerm, supplierSubTab, supplierIndustry, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return { suppliers, total, loading, industries, page, setPage, reload };
}
