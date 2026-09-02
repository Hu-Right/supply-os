/**
 * 供应商卡片组件
 * Supplier Card Component
 *
 * @module features/supplier/components/SupplierCard
 * @description 单个供应商展示卡片
 *              Single supplier display card
 */

import { Sparkles } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Button, Card, Badge } from "@/shared/ui";
import type { Supplier } from "@/types";

export interface SupplierCardProps {
  supplier: Supplier;
  onAiMatch: (supplier: Supplier) => void;
  onContact: (supplier: Supplier) => void;
}

export function SupplierCard({ supplier, onAiMatch, onContact }: SupplierCardProps) {
  const { t, locale } = useLocale();

  return (
    <Card interactive className="flex flex-col justify-between rounded-2xl p-5">
      <div>
        {/* Header line with tag */}
        <div className="mb-3 flex items-start justify-between">
          <Badge
            shape="pill"
            className={supplier.type === "domestic"
              ? "border border-teal-200 bg-teal-50 text-teal-700 text-[10px] font-bold"
              : "border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-bold"
            }
          >
            {supplier.type === "domestic" ? t("supplierTypeDomestic") : t("supplierTypeIntl")}
          </Badge>
          {supplier.status === "pending" ? (
            <Badge pulsate shape="pill" className="bg-amber-50 text-amber-700 text-[10px] font-bold uppercase">
              {t("supplierStatusPending")}
            </Badge>
          ) : (
            <Badge variant="success" shape="pill" className="text-[10px] font-bold uppercase">
              {t("supplierStatusVerified")}
            </Badge>
          )}
        </div>

        <h4 className="line-clamp-1 text-base font-extrabold text-slate-800">
          {pickLocale(locale, supplier.nameZh, supplier.nameEn)}
        </h4>

        <div className="mt-2 space-y-1.5 text-xs text-slate-500">
          <p className="flex items-center">
            <span className="me-1.5 shrink-0 font-extrabold text-slate-400">{t("location")}:</span>
            <span className="text-slate-700">
              {pickLocale(locale,
                `${supplier.countryZh} · ${supplier.cityZh}`,
                `${supplier.countryEn}, ${supplier.cityEn}`)}
            </span>
          </p>

          {supplier.ungmCode && (
            <p className="inline-block rounded bg-indigo-50/50 px-2 py-1 text-indigo-700">
              <span className="me-1.5 shrink-0 font-extrabold">{t("supplierUnspscCodeLabel")}</span>
              <span className="font-mono font-black">{supplier.ungmCode}</span>
            </p>
          )}
        </div>

        {/* Products & compliance badges — 无数据时隐藏整个区块 */}
        {((pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? []).length > 0 ||
          (pickLocale(locale, supplier.complianceLabelsZh, supplier.complianceLabelsEn) ?? []).length > 0) && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {(pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? []).length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t("mainProducts")}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? []).map((p, idx) => (
                    <span key={idx} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(pickLocale(locale, supplier.complianceLabelsZh, supplier.complianceLabelsEn) ?? []).length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t("complianceLabel")}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(pickLocale(locale, supplier.complianceLabelsZh, supplier.complianceLabelsEn) ?? []).map(
                    (c, idx) => (
                      <span
                        key={idx}
                        className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800"
                      >
                        {c}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operational actions */}
      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
        <Button
          onClick={() => onAiMatch(supplier)}
          variant="cta"
          size="sm"
          className="flex-1 rounded py-1.5 gap-1 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>{t("supplierAiMatchBtn")}</span>
        </Button>
        <Button
          onClick={() => onContact(supplier)}
          variant="secondary"
          size="sm"
          className="rounded px-2.5 text-slate-700 cursor-pointer"
        >
          {t("supplierContactBtn")}
        </Button>
      </div>
    </Card>
  );
}

SupplierCard.displayName = "SupplierCard";
