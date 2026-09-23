/**
 * 订制服务卡片（DB 驱动 · 重做版）
 *
 * @module features/membership/components/ServiceCard
 * @description 数据源 crm_service_catalog 行。价格移到标题下方独立行（根治长价挤标题）；
 *              分类归组由父级按 category 呈现，卡片不再逐张打撞词标签。
 *              分支：standard_price 非空 → 「立即支付」(实心, 由父级 onPay 发 supply-os:pay)；
 *                    为空 → 「扫码咨询」(描边, 弹 ContactQrModal)。
 */
"use client";

import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { resolveServiceBranch, serviceDisplayName } from "../utils";
import { ContactQrModal } from "./ContactQrModal";
import type { ServiceCatalogRow } from "@/types/membership";

export interface ServiceCardProps {
  row: ServiceCatalogRow;
  /** 有价分支：父级负责登录判断 + emit supply-os:pay */
  onPay: (row: ServiceCatalogRow) => void;
}

const SUFFIX_KEY: Record<string, string> = {
  per_unit: "svcPerUnit",
  per_time: "svcPerTime",
  per_year: "svcPerYear",
  project: "svcPerProject",
};

const NO_PRICE_LABEL: Record<string, string> = {
  token: "svcLabelToken",
  quote: "svcLabelQuote",
  contact: "svcLabelContact",
};

export function ServiceCard({ row, onPay }: ServiceCardProps) {
  const { t, locale } = useLocale();
  const [consultOpen, setConsultOpen] = useState(false);
  const branch = resolveServiceBranch(row);
  const name = serviceDisplayName(row, locale);
  const hasPrice = branch === "pay";
  const suffixKey = SUFFIX_KEY[row.price_mode];
  const note = locale.toLowerCase().startsWith("zh") ? row.deliverable_note_zh : null;
  const amount = row.standard_price == null ? 0 : Number(row.standard_price);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* 标题行：只放标题，价格不再挤同一行（修 KA 竖排） */}
      <h3 className="text-base font-extrabold leading-tight text-slate-900">{name}</h3>

      {/* 价格独立成行，有层级 */}
      {hasPrice ? (
        <div className="mt-2 flex items-baseline gap-1">
          {row.price_from === 1 && (
            <span className="text-xs font-semibold text-slate-500">{t("svcPriceFrom")}</span>
          )}
          <span className="text-2xl font-black text-slate-900">¥{amount.toLocaleString()}</span>
          {suffixKey && <span className="text-xs font-semibold text-slate-500">{t(suffixKey)}</span>}
        </div>
      ) : (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {t(NO_PRICE_LABEL[row.price_mode] ?? "svcLabelQuote")}
          </span>
        </div>
      )}

      {row.member_discount > 0 && (
        <span className="mt-2 inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
          {t("svcMemberExclusive")}
        </span>
      )}

      {note && <p className="mt-3 text-sm leading-relaxed text-slate-600">{note}</p>}

      {/* CTA：主次分明（有价实心 / 无价描边） */}
      <div className="mt-auto pt-4">
        {hasPrice ? (
          <button
            type="button"
            onClick={() => onPay(row)}
            className="w-full cursor-pointer rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
          >
            {t("svcCtaPay")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConsultOpen((v) => !v)}
            aria-expanded={consultOpen}
            className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {t("svcCtaConsult")}
          </button>
        )}
      </div>

      <ContactQrModal open={consultOpen} onClose={() => setConsultOpen(false)} />
    </div>
  );
}

ServiceCard.displayName = "ServiceCard";
