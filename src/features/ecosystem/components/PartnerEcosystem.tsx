/**
 * 第三方服务生态 — 子块B：入驻伙伴墙
 * Partner Wall
 *
 * @module features/services/components/PartnerEcosystem
 * @description 数据源 GET /api/eco-partners（eco_partner 表，迁移 062；无种子数据，
 *              空表时只渲染入驻邀请卡，不渲染空壳网格）。锚定位（featured）为通用大卡，
 *              live 态展示服务详情；用户侧 CTA=结构化询盘（带 partnerId 落 CRM），
 *              伙伴侧 CTA=入驻申请（免登录）。宁缺毋假：onboarding/in-talks 不展示详情。
 */

import { useEffect, useMemo, useState } from "react";
import { Globe, Plus } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Badge, type BadgeVariant } from "@/shared/ui";
import { Spinner } from "@/shared/ui";
import { fetchEcoPartners, type EcoPartner, type EcoPartnerStatus } from "../api";
import { ECO_PARTNER_CATEGORIES } from "@/data/ecosystem";
import { PartnerInquiryModal } from "./PartnerInquiryModal";
import { PartnerApplyModal } from "./PartnerApplyModal";

/** 徽章口径：live→info（已上架）/ in-talks→warning（洽谈中）/ onboarding→success（即将入驻） */
const STATUS_STYLE: Record<EcoPartnerStatus, { labelKey: string; variant: BadgeVariant }> = {
  live: { labelKey: "svcPartnerStatusLive", variant: "soft-info" },
  "in-talks": { labelKey: "svcPartnerStatusInTalks", variant: "soft-warning" },
  onboarding: { labelKey: "svcPartnerStatusOnboarding", variant: "soft-success" },
};

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  ECO_PARTNER_CATEGORIES.map((c) => [c.key, c.label]),
);

/** PartnerCard / FeaturedPartnerCard 共用的询盘弹窗唤起 */
interface CardProps {
  partner: EcoPartner;
  onInquiry: (partner: EcoPartner) => void;
}

function PartnerLogo({ partner, large }: { partner: EcoPartner; large?: boolean }) {
  const size = large ? "w-14 h-14 text-2xl" : "w-11 h-11 text-lg";
  if (partner.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 运营侧外链 logo，非静态资源
      <img
        src={partner.logoUrl}
        alt={partner.name}
        className={`flex-shrink-0 ${size} rounded-xl object-contain bg-white border border-slate-200 p-1`}
      />
    );
  }
  return (
    <div className={`flex-shrink-0 ${size} rounded-xl bg-slate-900 flex items-center justify-center text-white font-extrabold`}>
      {partner.name.charAt(0)}
    </div>
  );
}

/** 锚定位大卡（featured，通用位不写死任何一家；live 且有详情时展示服务详情段落） */
function FeaturedPartnerCard({ partner, onInquiry }: CardProps) {
  const { t, locale } = useLocale();
  const status = STATUS_STYLE[partner.status];
  const scope = pickLocale(locale, partner.scope, partner.scopeEn);
  const regions = pickLocale(locale, partner.regions, partner.regionsEn);

  return (
    <div className="rounded-2xl border-2 border-teal-600/30 bg-gradient-to-br from-teal-50/60 to-white p-6 shadow-sm flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex items-start gap-4 min-w-0 md:w-2/3">
        <PartnerLogo partner={partner} large />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-slate-900">{partner.name}</h3>
            <Badge shape="pill" variant={status.variant} className="text-[11px] font-bold">
              {t(status.labelKey)}
            </Badge>
            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-xs font-bold">
              {CATEGORY_LABEL[partner.category]}
            </span>
          </div>
          {partner.nameEn && <p className="mt-0.5 text-xs text-slate-400">{partner.nameEn}</p>}
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{scope}</p>
          {partner.detail && (
            <p className="mt-2 text-xs text-slate-500 leading-relaxed whitespace-pre-line line-clamp-4">
              {partner.detail}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3 md:w-1/3 md:border-l md:border-slate-200 md:pl-6">
        {regions && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{regions}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => onInquiry(partner)}
          disabled={partner.status !== "live"}
          className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
        >
          {partner.status === "live" ? t("svcPartnerCta") : t("svcPartnerCtaPending")}
        </button>
      </div>
    </div>
  );
}

/** 普通伙伴卡（in-talks / onboarding / 非 featured 的 live） */
function PartnerCard({ partner, onInquiry }: CardProps) {
  const { t, locale } = useLocale();
  const status = STATUS_STYLE[partner.status];
  const scope = pickLocale(locale, partner.scope, partner.scopeEn);
  const regions = pickLocale(locale, partner.regions, partner.regionsEn);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow">
      {/* 品牌行：logo/首字母 + 名称 + 状态 */}
      <div className="flex items-start gap-3 mb-3">
        <PartnerLogo partner={partner} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-slate-900 truncate">{partner.name}</h3>
            <Badge shape="pill" variant={status.variant} className="flex-shrink-0 text-[11px] font-bold">
              {t(status.labelKey)}
            </Badge>
          </div>
          {partner.nameEn && <p className="text-xs text-slate-400 truncate">{partner.nameEn}</p>}
        </div>
      </div>

      {/* 服务类别 */}
      <span className="self-start px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-xs font-bold mb-2">
        {CATEGORY_LABEL[partner.category]}
      </span>

      {/* 服务能力 */}
      <p className="text-xs text-slate-500 leading-relaxed mb-3">{scope}</p>

      {/* 覆盖区域 */}
      <div className="mt-auto flex items-center gap-1.5 text-xs text-slate-400 mb-4">
        <Globe className="w-3.5 h-3.5" />
        <span>{regions}</span>
      </div>

      {/* CTA：live 才可询盘；洽谈中/筹备中禁用（宁缺毋假，不接虚询盘） */}
      <button
        type="button"
        onClick={() => onInquiry(partner)}
        disabled={partner.status !== "live"}
        className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
      >
        {partner.status === "live" ? t("svcPartnerCta") : t("svcPartnerCtaPending")}
      </button>
    </div>
  );
}

export function PartnerEcosystem() {
  const { t } = useLocale();
  const [partners, setPartners] = useState<EcoPartner[] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [inquiryPartner, setInquiryPartner] = useState<EcoPartner | null>(null);
  const [showApply, setShowApply] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEcoPartners()
      .then((rows) => { if (!cancelled) { setPartners(rows); setLoadState("ready"); } })
      .catch(() => { if (!cancelled) setLoadState("ready"); }); // 拉取失败按空表兜底（保留邀请卡）
    return () => { cancelled = true; };
  }, []);

  const { featured, rest } = useMemo(() => {
    const rows = partners ?? [];
    return {
      // 锚定位取 featured（suspended 已在服务端过滤，不出网）
      featured: rows.find((p) => p.featured) ?? null,
      rest: rows.filter((p) => !p.featured),
    };
  }, [partners]);

  return (
    <div className="space-y-4">
      {/* 子块标题 + 类目条 */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <h3 className="text-base font-extrabold text-slate-900">{t("svcEcoWallTitle")}</h3>
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

      {loadState === "loading" ? (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* 锚定位 */}
          {featured && <FeaturedPartnerCard partner={featured} onInquiry={setInquiryPartner} />}

          {/* 伙伴卡网格（3列）+ 入驻邀请卡；空表时仅邀请卡 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rest.map((partner) => (
              <PartnerCard key={partner.slug} partner={partner} onInquiry={setInquiryPartner} />
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
                onClick={() => setShowApply(true)}
                className="px-6 py-2.5 rounded-lg border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white text-sm font-bold transition-colors"
              >
                {t("svcEcoJoinCta")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：结构化询盘（带 partnerId）/ 入驻申请（免登录） */}
      {inquiryPartner && (
        <PartnerInquiryModal partner={inquiryPartner} onClose={() => setInquiryPartner(null)} />
      )}
      {showApply && <PartnerApplyModal onClose={() => setShowApply(false)} />}
    </div>
  );
}

PartnerEcosystem.displayName = "PartnerEcosystem";
