// i18n-allow-file: 规则级缺口/整改文案来自 shared/constants/diagnosis-bid-gate（内容翻译欠债另册登记）
/**
 * 诊断结果 —— 投标资格判定卡
 * Bid-eligibility verdict card
 *
 * @module features/procurement/components/BidGateCard
 * @description 2026-11-27 口径：结果页原来只显示「68/100 · B 级」，但资格预审是 pass/fail，
 *              总分 78 分也可能因一项废标项进不了名单。本卡把结论拆成两块并排呈现：
 *              1. 资格（A 段合格制）—— 出局 / 有条件 / 已具备，附废标项清单与整改动作；
 *              2. 竞争力（B 段评分制）—— 达标 / 中等 / 偏弱，只回答「值不值得投」。
 *
 *              国别准入缺口读服务端返回的 qualBreakdown（逐市场法定要求），
 *              与闸门规则里的「缺口 N 项」同源，不在此重算。
 */
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock3, FileCheck2, MapPin } from "lucide-react";
import { Badge, type BadgeVariant } from "@/shared/ui";
import {
  bidCompetitivenessLabel,
  bidEligibilityLabel,
  type BidGateHit,
  type BidGateResult,
} from "@/shared/constants/diagnosis-bid-gate";
import type { DiagnosisQualBreakdown } from "@/shared/api/diagnosis";

type T = (key: string) => string;

interface Props {
  gate: BidGateResult;
  /** 逐市场法定准入缺口（服务端资质分级结果）；缺失时只展示闸门规则 */
  qualBreakdown?: DiagnosisQualBreakdown | null;
  t: T;
}

/** 资格 → 徽章配色（出局红 / 有条件黄 / 已具备绿） */
function eligibilityStyle(e: BidGateResult["eligibility"]): {
  variant: BadgeVariant;
  box: string;
  icon: typeof CheckCircle2;
  iconCls: string;
} {
  if (e === "out") {
    return { variant: "soft-danger", box: "border-rose-200 bg-rose-50/70", icon: AlertOctagon, iconCls: "text-rose-600" };
  }
  if (e === "conditional") {
    return { variant: "soft-warning", box: "border-amber-200 bg-amber-50/70", icon: AlertTriangle, iconCls: "text-amber-600" };
  }
  return { variant: "soft-success", box: "border-emerald-200 bg-emerald-50/70", icon: CheckCircle2, iconCls: "text-emerald-600" };
}

function competitivenessStyle(c: BidGateResult["competitiveness"]): BadgeVariant {
  if (c === "strong") return "soft-success";
  if (c === "viable") return "soft-warning";
  return "soft-danger";
}

function leadTimeText(days: number | null, t: T): string {
  if (days == null) return t("bidGateLeadUnknown");
  return t("bidGateLeadDays").replace("{n}", String(days));
}

/** 单条缺口：标题 + 缺什么 + 怎么补 + 周期 + 所需证据 */
function HitRow({ hit, index, t }: { hit: BidGateHit; index?: number; t: T }) {
  const isHard = hit.level === "disqualify";
  return (
    <li className={`rounded-xl border p-3 ${isHard ? "border-rose-200 bg-white" : "border-amber-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {index != null && (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-2xs font-bold text-white">
            {index}
          </span>
        )}
        <span className="text-sm font-bold text-slate-800">{t(hit.titleKey) || hit.titleZh}</span>
        <Badge variant={isHard ? "soft-danger" : "soft-warning"}>
          {isHard ? t("bidGateHardBlock") : t("bidGateSoftBlock")}
        </Badge>
        <span className="inline-flex items-center gap-1 text-2xs text-slate-500">
          <Clock3 className="h-3 w-3" />{leadTimeText(hit.leadTimeDays, t)}
        </span>
        <span className="inline-flex items-center gap-1 text-2xs text-slate-400">
          <FileCheck2 className="h-3 w-3" />{hit.evidenceLevel}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{hit.gapZh}</p>
      <p className="mt-1 text-xs leading-relaxed text-teal-700">
        <span className="font-semibold">{t("bidGateFixLabel")}：</span>{hit.remediationZh}
      </p>
    </li>
  );
}

export function BidGateCard({ gate, qualBreakdown, t }: Props) {
  const style = eligibilityStyle(gate.eligibility);
  const Icon = style.icon;
  const legalGaps = (qualBreakdown?.requirements?.legal ?? []).filter((r) => !r.held);
  const markets = qualBreakdown?.targetMarkets ?? [];

  return (
    <div className="space-y-4">
      {/* 结论区：资格与竞争力两行，互不换算 */}
      <section className={`rounded-2xl border p-4 ${style.box}`}>
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconCls}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-slate-900">{t("bidGateEligibilityTitle")}</span>
              <Badge variant={style.variant}>{bidEligibilityLabel(gate.eligibility)}</Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{gate.verdictZh}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2">
              <span className="text-2xs font-semibold text-slate-500">{t("bidGateCompetitivenessTitle")}</span>
              <Badge variant={competitivenessStyle(gate.competitiveness)}>
                {bidCompetitivenessLabel(gate.competitiveness)}
              </Badge>
              <span className="text-2xs text-slate-400">{t("bidGateCompetitivenessHint")}</span>
            </div>

            {!gate.derivedComplete && (
              <p className="mt-2 text-2xs leading-relaxed text-slate-500">{t("bidGateDerivedMissing")}</p>
            )}
          </div>
        </div>
      </section>

      {/* 废标项：缺一项即出局 */}
      {gate.disqualifiers.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <AlertOctagon className="h-4 w-4 text-rose-600" />
            {t("bidGateHardBlocksTitle")}
            <span className="text-xs font-normal text-slate-400">（{gate.disqualifiers.length}）</span>
          </h3>
          <p className="mt-1 text-2xs leading-relaxed text-slate-500">{t("bidGateHardBlocksHint")}</p>
          <ul className="mt-3 space-y-2">
            {gate.disqualifiers.map((hit) => (
              <HitRow key={hit.id} hit={hit} t={t} />
            ))}
          </ul>
        </section>
      )}

      {/* 可补项：补齐后可投 */}
      {gate.conditionals.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {t("bidGateSoftBlocksTitle")}
            <span className="text-xs font-normal text-slate-400">（{gate.conditionals.length}）</span>
          </h3>
          <p className="mt-1 text-2xs leading-relaxed text-slate-500">{t("bidGateSoftBlocksHint")}</p>
          <ul className="mt-3 space-y-2">
            {gate.conditionals.map((hit) => (
              <HitRow key={hit.id} hit={hit} t={t} />
            ))}
          </ul>
        </section>
      )}

      {/* 国别准入缺口：逐市场法定要求（服务端资质分级结果） */}
      {legalGaps.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <MapPin className="h-4 w-4 text-slate-600" />
            {t("bidGateLegalGapTitle")}
            <span className="text-xs font-normal text-slate-400">
              （{legalGaps.length}{markets.length > 0 ? ` / ${markets.length} ${t("bidGateMarketsUnit")}` : ""}）
            </span>
          </h3>
          <p className="mt-1 text-2xs leading-relaxed text-slate-500">{t("bidGateLegalGapHint")}</p>
          <ul className="mt-3 space-y-1.5">
            {legalGaps.slice(0, 8).map((gap) => (
              <li key={`${gap.market}-${gap.standard}`} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{gap.market}</span>
                  <span className="text-slate-400">·</span>
                  <span>{gap.name}</span>
                  {gap.leadTimeDays != null && (
                    <span className="text-2xs text-slate-500">（≈{gap.leadTimeDays}d）</span>
                  )}
                </div>
                {gap.remediation && <p className="mt-0.5 text-2xs text-slate-500">{gap.remediation}</p>}
              </li>
            ))}
          </ul>
          {legalGaps.length > 8 && (
            <p className="mt-2 text-2xs text-slate-400">
              {t("bidGateLegalGapMore").replace("{n}", String(legalGaps.length - 8))}
            </p>
          )}
        </section>
      )}

      {/* 整改顺序：废标优先 + 周期短优先 */}
      {gate.nextActions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-800">{t("bidGateNextActionsTitle")}</h3>
          <p className="mt-1 text-2xs leading-relaxed text-slate-500">{t("bidGateNextActionsHint")}</p>
          <ol className="mt-3 space-y-2">
            {gate.nextActions.map((hit, i) => (
              <HitRow key={`next-${hit.id}`} hit={hit} index={i + 1} t={t} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
