/**
 * 投标服务市场 — 第三方服务生态分区（邀约入驻伙伴）
 * Partner Ecosystem — invitation-only third-party service partners
 *
 * @module features/services/components/PartnerEcosystem
 * @description 按合规/履约/售后/本地化运营四类展示生态伙伴；
 *              洽谈中伙伴以品牌墙形式先上，签约后点亮详情；
 *              尾部入驻邀请卡承接伙伴侧线索（复用全局咨询弹窗）。
 */

import { Globe, Plus } from "lucide-react";
import { ECO_PARTNERS, ECO_PARTNER_CATEGORIES } from "@/data/services";
import type { EcoPartnerItem, EcoPartnerStatus } from "@/data/services";
import { emitAppEvent } from "@/core/events";
import { useLocale } from "@/core/i18n";

const STATUS_STYLE: Record<EcoPartnerStatus, { labelKey: string; className: string }> = {
  live: { labelKey: "svcPartnerStatusLive", className: "bg-teal-50 text-teal-700 border-teal-200" },
  "in-talks": { labelKey: "svcPartnerStatusInTalks", className: "bg-amber-50 text-amber-600 border-amber-200" },
};

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  ECO_PARTNER_CATEGORIES.map((c) => [c.key, c.label]),
);

function PartnerCard({ partner }: { partner: EcoPartnerItem }) {
  const { t } = useLocale();
  const status = STATUS_STYLE[partner.status];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow">
      {/* 品牌行：文字标识 + 名称 + 状态 */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center text-white text-lg font-extrabold">
          {partner.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-slate-900 truncate">{partner.name}</h3>
            <span
              className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-bold ${status.className}`}
            >
              {t(status.labelKey)}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">{partner.nameEn}</p>
        </div>
      </div>

      {/* 服务类别 */}
      <span className="self-start px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-xs font-bold mb-2">
        {CATEGORY_LABEL[partner.category]}
      </span>

      {/* 服务能力 */}
      <p className="text-xs text-slate-500 leading-relaxed mb-3">{partner.scope}</p>

      {/* 覆盖区域 */}
      <div className="mt-auto flex items-center gap-1.5 text-xs text-slate-400 mb-4">
        <Globe className="w-3.5 h-3.5" />
        <span>{partner.regions}</span>
      </div>

      {/* CTA 按钮 */}
      <button
        type="button"
        onClick={() => emitAppEvent("supply-os:consult")}
        className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors"
      >
        {t("svcPartnerCta")}
      </button>
    </div>
  );
}

export function PartnerEcosystem() {
  const { t } = useLocale();
  return (
    <section>
      {/* 分区标题 + 四类类目标签 */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl font-extrabold text-slate-900">{t("svcEcoTitle")}</h2>
            <span className="px-2 py-0.5 rounded-full bg-teal-600/10 text-teal-700 text-xs font-bold">
              {t("svcEcoBadge")}
            </span>
          </div>
          <p className="mt-1 text-xs md:text-sm text-slate-500 max-w-2xl">
            {t("svcEcoDesc")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ECO_PARTNER_CATEGORIES.map((c) => (
            <span
              key={c.key}
              className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-500"
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* 伙伴卡片 + 入驻邀请卡（3列正好一行） */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {ECO_PARTNERS.map((partner) => (
          <PartnerCard key={partner.nameEn} partner={partner} />
        ))}

        <div className="rounded-2xl border-2 border-dashed border-slate-300 p-5 flex flex-col items-center justify-center text-center min-h-[220px]">
          <div className="w-11 h-11 rounded-full bg-teal-50 flex items-center justify-center mb-3">
            <Plus className="w-5 h-5 text-teal-600" />
          </div>
          <h3 className="text-sm font-extrabold text-slate-900 mb-1">{t("svcEcoJoinTitle")}</h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-4 max-w-[240px]">
            {t("svcEcoJoinDesc")}
          </p>
          <button
            type="button"
            onClick={() => emitAppEvent("supply-os:consult")}
            className="px-6 py-2.5 rounded-lg border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white text-sm font-bold transition-colors"
          >
            {t("svcEcoJoinCta")}
          </button>
        </div>
      </div>
    </section>
  );
}

PartnerEcosystem.displayName = "PartnerEcosystem";
