/**
 * 企业 Tab 并列卡：1:1 人工找单（¥199）
 * Enterprise companion card — manual bid-matching service
 *
 * @module features/membership/components/EnterpriseCompanionCard
 * @description 企业版收敛为「199 人工找单 + 8800 企业智能版」两档并列。8800 是订阅（走 PlanCard），
 *              199 是一次性人工服务（crm_service_catalog 行）。通用 ServiceCard 面向服务 Tab 的小卡，
 *              直接与企业订阅卡并列会因内容稀疏 + grid 拉伸出现大片空白，故本组件复用 PlanCard 的
 *              视觉语言（卡头色带 + 价格块 + 价值清单 + CTA），让它读起来像一张对等的企业档位卡。
 *              商品属性（名称/价格/交付说明）仍读服务目录行，前端不硬编码价格。
 */
import { Check, PhoneCall } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { serviceDisplayName } from "../utils";
import type { ServiceCatalogRow } from "@/types/membership";

export interface EnterpriseCompanionCardProps {
  row: ServiceCatalogRow;
  /** 有价分支：父级负责登录判断 + emit supply-os:pay */
  onPay: (row: ServiceCatalogRow) => void;
}

/** 价值清单 i18n 键（人工服务卖点，与订阅卡的权益清单区分）。 */
const BULLET_KEYS = ["entCompanionBullet1", "entCompanionBullet2", "entCompanionBullet3"] as const;

export function EnterpriseCompanionCard({ row, onPay }: EnterpriseCompanionCardProps) {
  const { t, locale } = useLocale();
  const name = serviceDisplayName(row, locale);
  const amount = row.standard_price == null ? 0 : Number(row.standard_price);
  const symbol = row.currency === "CNY" ? "¥" : "$";
  const note = locale.toLowerCase().startsWith("zh") ? row.deliverable_note_zh : null;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
      data-testid="enterprise-companion-card"
    >
      {/* ═══ 卡头（色带区别于订阅：teal→emerald 表达"人工服务"）═══ */}
      <div className="bg-gradient-to-br from-teal-600 to-emerald-600 px-5 py-4 text-white">
        <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
          {t("entCompanionTag")}
        </span>
        <h3 className="text-base font-extrabold leading-tight">{name}</h3>
        {note && <p className="mt-1 text-xs text-white/85 line-clamp-2">{note}</p>}
      </div>

      {/* ═══ 价格块 ═══ */}
      <div className="px-5 pt-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            {symbol}
            {amount.toLocaleString()}
            <span className="text-sm font-medium text-slate-500">{t("svcPerTime")}</span>
          </span>
          <p className="mt-0.5 text-2xs text-slate-500">{t("entCompanionPriceNote")}</p>
        </div>
      </div>

      {/* ═══ 价值清单 ═══ */}
      <ul className="flex-1 space-y-1.5 px-5 py-4">
        {BULLET_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-2 text-xs text-slate-700">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      {/* ═══ CTA ═══ */}
      <div className="px-5 pb-5">
        <Button type="button" variant="cta" onClick={() => onPay(row)} className="w-full rounded-xl py-2.5 text-sm">
          <PhoneCall className="w-4 h-4" />
          {t("entCompanionCta")}
        </Button>
      </div>
    </div>
  );
}

EnterpriseCompanionCard.displayName = "EnterpriseCompanionCard";
