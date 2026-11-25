/**
 * 供应商企业主页 — 相似供应商
 *
 * @module features/supplier-profile/components/SupplierSimilarSection
 * @description 同行业子树优先、同国家补齐的相似企业卡片；无数据整段隐藏。
 */
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { SimilarSupplierItem } from "@/lib/services/supplier-profile-page";
import type { SupplierProfileCopy, SupplierProfileLocale } from "../copy";

export interface SupplierSimilarSectionProps {
  items: SimilarSupplierItem[];
  copy: SupplierProfileCopy;
  locale: SupplierProfileLocale;
}

export function SupplierSimilarSection({ items, copy, locale }: SupplierSimilarSectionProps) {
  if (items.length === 0) return null;
  // 单语站（ADR-0024）：供应商目录只有 /supplier 一个入口，不再有 /en 分支
  const base = "/supplier";
  const directory = "/supplier";

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-slate-900">{copy.similarTitle}</h2>
        {directory && (
          <Link
            href={directory}
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
          >
            {copy.similarMore}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const location = [
            locale === "en" ? item.countryCode || item.country : item.country,
            item.province,
            item.city,
          ]
            .filter(Boolean)
            .join(" · ");
          const industry = locale === "en" ? item.industryEn : item.industryZh;
          const sharedText = item.sharedNames
            .map((n) => (locale === "en" ? n.en : n.zh))
            .join(locale === "en" ? ", " : "、");
          const reason =
            item.matchKind === "commodity"
              ? sharedText
                ? `${copy.similarByCommodity} · ${sharedText}`
                : copy.similarByCommodity
              : item.matchKind === "industry"
                ? copy.similarByIndustry
                : copy.similarByRegion;
          return (
            <Link
              key={item.id}
              href={`${base}/${item.id}`}
              className="group flex flex-col gap-2 rounded-xl border border-slate-200 p-4 transition-colors hover:border-teal-300 hover:bg-teal-50/40"
            >
              <p className="line-clamp-2 text-sm font-extrabold text-slate-900 group-hover:text-teal-800">
                {item.company}
              </p>
              <p className="text-2xs font-bold text-teal-700">{reason}</p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3" />
                {location || "-"}
              </p>
              {industry && <p className="text-xs font-semibold text-blue-700">{industry}</p>}
              {item.productsText && (
                <p className="line-clamp-2 whitespace-pre-line text-xs text-slate-500">{item.productsText}</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
