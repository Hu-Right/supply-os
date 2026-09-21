/**
 * 增值服务留资卡（非自助订阅套餐）
 * Service lead card — 报价表服务型 SKU：只展示品类与权益，CTA 扫码联系顾问，不走支付
 *
 * @module features/membership/components/ServiceCard
 */
"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, MessageCircle, QrCode } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { ServiceCatalogItem } from "../data/service-catalog";

export interface ServiceCardProps {
  item: ServiceCatalogItem;
}

export function ServiceCard({ item }: ServiceCardProps) {
  const { t } = useLocale();
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-block text-3xs font-bold uppercase tracking-widest text-teal-600 mb-1">
            {item.category}
          </span>
          <h3 className="text-base font-extrabold text-slate-900 leading-tight">{item.name}</h3>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
          {item.price}
        </span>
      </div>

      <p className="mt-1 text-2xs text-slate-400">{t("svcServiceMode")}{item.mode}</p>

      <ul className="mt-3 space-y-1.5 flex-1">
        {item.benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
            <Check className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer"
          aria-expanded={showQr}
        >
          <MessageCircle className="w-4 h-4" />
          {showQr ? t("svcCtaClose") : t("svcCtaOpen")}
        </button>
        {showQr && (
          <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <Image
              src="/wechat-service-qr.png"
              alt="客服微信二维码"
              width={140}
              height={140}
              className="rounded-lg"
              unoptimized
            />
            <p className="flex items-center gap-1 text-2xs text-slate-500 text-center">
              <QrCode className="w-3 h-3" />
              {t("svcQrHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

ServiceCard.displayName = "ServiceCard";
