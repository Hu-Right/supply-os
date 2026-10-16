"use client";

/**
 * 中标情报页 — 策展数据卡片集（自 page-client.tsx 拆出，JSX 逐字不变）。
 * 全部展示组件（React.memo）：弹窗开合与滚动动作由容器回调驱动。
 *
 * @module app/(public)/award-intelligence/sections/cards
 */
import { memo } from "react";
import { ArrowRight } from "lucide-react";
import { INFO_CARDS, BUYER_PROFILE, TOP5_WINNERS, type SelectedSupplier } from "../curatedData";

/** 四张情报速览卡：动作文案 → 容器分派（查看趋势/品类/名单/提醒） */
export const InfoCardsGrid = memo(function InfoCardsGrid({ onAction }: { onAction: (link: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {INFO_CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.title} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${card.borderColor} p-5 shadow-sm`}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">{card.title}</h3>
              <Icon className={`w-8 h-8 ${card.iconColor} opacity-80`} />
            </div>
            <p className="text-xl font-extrabold text-slate-900 whitespace-pre-line mb-1">{card.value}</p>
            {card.sub && <p className="text-xs text-slate-500 mb-3">{card.sub}</p>}
            <div className="flex items-center justify-between mt-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${card.badgeColor}`}>{card.badge}</span>
              <button onClick={() => onAction(card.link)} className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">{card.link} <ArrowRight className="w-3 h-3" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
});

/** 采购机构画像卡 */
export const BuyerProfileCard = memo(function BuyerProfileCard({ onOpenAgency }: { onOpenAgency: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-1">采购机构画像</h3>
      <p className="text-xs text-slate-500 mb-4">UNICEF 采购画像（近12个月）</p>
      <div className="space-y-3">
        {BUYER_PROFILE.map((row) => (
          <div key={row.label} className="flex items-start gap-3 text-sm">
            <span className="shrink-0 w-24 text-xs font-bold text-slate-500">{row.label}</span>
            {row.isStar ? <span className="text-amber-400 text-sm">{row.value}</span> : <span className="text-sm font-bold text-slate-800">{row.value}</span>}
          </div>
        ))}
      </div>
      <button onClick={onOpenAgency} className="mt-5 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">查看机构详情 <ArrowRight className="w-3.5 h-3.5" /></button>
    </div>
  );
});

/** 主要中标商 TOP 5 表卡 */
export const TopWinnersCard = memo(function TopWinnersCard({
  onSelectSupplier,
  onOpenWinners,
}: {
  onSelectSupplier: (w: SelectedSupplier) => void;
  onOpenWinners: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-1">主要中标商 TOP 5 <span className="text-xs font-normal text-slate-400">（UN医疗品类）</span></h3>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 text-slate-400 font-bold">排名</th>
              <th className="text-left py-2 text-slate-400 font-bold">供应商</th>
              <th className="text-left py-2 text-slate-400 font-bold">品类</th>
              <th className="text-center py-2 text-slate-400 font-bold">UNGM</th>
            </tr>
          </thead>
          <tbody>
            {TOP5_WINNERS.map((w) => (
              <tr key={w.rank} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => onSelectSupplier(w)}>
                <td className="py-2.5 font-bold text-slate-400">{w.rank}</td>
                <td className="py-2.5 font-bold text-teal-700 hover:underline">{w.name}</td>
                <td className="py-2.5 text-slate-600">{w.category}</td>
                <td className="py-2.5 text-center">
                  <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${w.level === "UNGM L2" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                    {w.level}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onOpenWinners} className="mt-4 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">查看完整名单 <ArrowRight className="w-3.5 h-3.5" /></button>
    </div>
  );
});
