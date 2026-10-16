/**
 * 首页三栏 — 优质供应商滚动卡
 * Home supplier scroll card
 *
 * @module features/home/components/content/SupplierScrollCard
 * @description 从 ContentColumns 内联 renderItem 抽出（2026-10 组件拆分）。
 *              纯展示组件：头像底色由 shared/utils/format.avatarColorFromName
 *              给出确定性哈希色（同名人永远同色），本文件不再内联工具函数。
 */
import { avatarColorFromName } from "@/shared/utils/format";

/** /api/suppliers 分页 items 的前端 DTO 形状（mapSupplierRow 产物，仅本卡用到的字段） */
export interface HomeSupplierItem {
  id: string;
  nameZh: string;
  countryZh: string;
  cityZh: string;
  industryZh: string;
  complianceLabelsZh: string[];
  mainProductsZh: string[];
  status: string;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** 优质供应商滚动卡（滚动展示 20 条） */
export function SupplierScrollCard({ supplier, t }: { supplier: HomeSupplierItem; t: TFn }) {
  return (
    <a key={supplier.id} href={`/supplier/${supplier.id}`} className="block group py-4">
      {/* 第一行：头像 + 公司名 + 认证标签 */}
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-extrabold"
          style={{ backgroundColor: avatarColorFromName(supplier.nameZh) }}
        >
          {supplier.nameZh.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
              {supplier.nameZh}
            </p>
            {supplier.status === "approved" && (
              <span className="shrink-0 px-1.5 py-0.5 rounded border border-teal-200 bg-teal-50 text-2xs font-bold text-teal-700">
                {t("homeCertSupplier")}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {[supplier.countryZh, supplier.cityZh].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {/* 第二行：行业 + 资质标签 */}
      <div className="flex flex-wrap items-center gap-1 mt-3">
        {supplier.industryZh && (
          <span className="text-2xs px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-700 font-bold">
            {supplier.industryZh}
          </span>
        )}
        {(supplier.complianceLabelsZh ?? []).slice(0, 3).map((label, j) => (
          <span key={j} className="text-2xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {label}
          </span>
        ))}
      </div>
      {/* 第三行：主营产品 + 按钮 */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-slate-500 truncate flex-1 mr-3">
          {(supplier.mainProductsZh ?? []).slice(0, 3).join(" · ")}
        </p>
        <span className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 group-hover:border-teal-400 group-hover:text-teal-700 transition-colors">
          {t("homeViewDetail")}
        </span>
      </div>
    </a>
  );
}
