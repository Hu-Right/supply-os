"use client";

/**
 * 中标情报页 — 数据卡片集（消费视图模型切片 + 诚实空态，自 page-client 拆出）。
 * 全部展示组件（React.memo）：弹窗开合与滚动动作由容器回调驱动。
 * i18n：VM 已产出各展示串；本组件经 useLocale().t 出动作文案（linkLabelKey）与本层标题/表头。
 *
 * @module app/(public)/award-intelligence/sections/cards
 */
import { memo } from "react";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import type { InfoCard, InfoCardAction, ProfileRow, WinnerRow, RecentRow, Section } from "@/features/procurement/awards/awardViewModel";

/** 四张情报速览卡：真实派生卡；无数据（cards=[]）即整体诚实空态。分发用稳定码，文案经 linkLabelKey。 */
export const InfoCardsGrid = memo(function InfoCardsGrid({ cards, onAction }: { cards: InfoCard[]; onAction: (link: InfoCardAction) => void }) {
  const { t } = useLocale();
  if (cards.length === 0) {
    return <div className="mb-6"><EmptyState title={t("awardDataConnecting")} description={t("awardInfoGridEmptyDesc")} /></div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.title} className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-teal-500 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">{card.title}</h3>
          <p className="text-xl font-extrabold text-slate-900 whitespace-pre-line mb-1">{card.value}</p>
          {card.sub && <p className="text-xs text-slate-500 mb-3">{card.sub}</p>}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-600">{card.badge}</span>
            <button onClick={() => onAction(card.link)} className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">{t(card.linkLabelKey)} <ArrowRight className="w-3 h-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
});

/** 采购机构画像卡：无真实画像即诚实空态 */
export const BuyerProfileCard = memo(function BuyerProfileCard({ section, onOpenAgency }: { section: Section<ProfileRow[]>; onOpenAgency: () => void }) {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-3">{t("awardBuyerProfileTitle")}</h3>
      {section.present ? (
        <div className="space-y-3">
          {section.data.map((row) => (
            <div key={row.label} className="flex items-start gap-3 text-sm">
              <span className="shrink-0 w-24 text-xs font-bold text-slate-500">{row.label}</span>
              <span className="text-sm font-bold text-slate-800">{row.value}</span>
            </div>
          ))}
          <button onClick={onOpenAgency} className="mt-2 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">{t("awardBuyerProfileDetailBtn")} <ArrowRight className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <EmptyState title={t("awardBuyerProfileEmptyTitle")} description={section.reason} className="p-4" />
      )}
    </div>
  );
});

/** 主要中标商 TOP 5 表卡：真实中标商（按中标次数），无则诚实空态 */
export const TopWinnersCard = memo(function TopWinnersCard({ section, onSelectSupplier, onOpenWinners }: {
  section: Section<WinnerRow[]>; onSelectSupplier: (w: WinnerRow) => void; onOpenWinners: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-3">{t("awardWinnersCardTitle")} <span className="text-xs font-normal text-slate-400">{t("awardWinnersCardSuffix")}</span></h3>
      {section.present ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-slate-400 font-bold">{t("awardThRank")}</th>
                  <th className="text-left py-2 text-slate-400 font-bold">{t("awardThSupplier")}</th>
                  <th className="text-center py-2 text-slate-400 font-bold">{t("awardThWinCount")}</th>
                </tr>
              </thead>
              <tbody>
                {section.data.slice(0, 5).map((w) => (
                  <tr key={w.rank} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => onSelectSupplier(w)}>
                    <td className="py-2.5 font-bold text-slate-400">{w.rank}</td>
                    <td className="py-2.5 font-bold text-teal-700 hover:underline">{w.name}</td>
                    <td className="py-2.5 text-center font-bold text-slate-600">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-slate-400 mt-2">{t("awardWinnersCleansingNote")}</p>
          <button onClick={onOpenWinners} className="mt-2 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">{t("awardWinnersMoreBtn")} <ArrowRight className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <EmptyState title={t("awardWinnersEmptyTitle")} description={section.reason} className="p-4" />
      )}
    </div>
  );
});

/** 最新中标记录表：真实记录，是现有数据里最有货的诚实内容 */
export const RecentAwardsCard = memo(function RecentAwardsCard({ rows }: { rows: RecentRow[] }) {
  const { t } = useLocale();
  if (rows.length === 0) return <EmptyState title={t("awardRecentEmptyTitle")} description={t("awardDataConnecting")} className="p-4" />;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-3">{t("awardRecentTitle")}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 text-slate-400 font-bold">{t("awardThProject")}</th>
              <th className="text-left py-2 text-slate-400 font-bold">{t("awardThBuyer")}</th>
              <th className="text-left py-2 text-slate-400 font-bold">{t("awardThDate")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="py-2 pr-2 text-slate-700 max-w-[280px] truncate" title={r.title}>{r.titleCn || r.title}</td>
                <td className="py-2 text-slate-500 whitespace-nowrap">{r.agency ?? "—"}</td>
                <td className="py-2 text-slate-500 whitespace-nowrap">{r.awardDate ? String(r.awardDate).slice(0, 10) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
