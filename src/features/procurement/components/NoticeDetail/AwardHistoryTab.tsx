/**
 * 历史中标 Tab — 真实数据组件
 * Award History Tab — Real Data Component
 *
 * @module features/procurement/components/NoticeDetail/AwardHistoryTab
 * @description 展示同类 UNSPSC 品类的历史中标数据：
 *              汇总统计 + 国家分布 + 中标商排行 + 最近中标记录。
 *              数据由 useAwardHistory hook 从 /api/notices/:id/award-history 获取。
 */
import { useEffect } from "react";
import {
  TrendingUp, Globe, Users, DollarSign, Calendar,
  AlertCircle, Loader2, Database,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { useAwardHistory, type AwardHistoryData } from "../../hooks/useAwardHistory";

interface AwardHistoryTabProps {
  noticeId: number | undefined;
}

/** 格式化美元金额 */
function formatUsd(value: number | null): string {
  if (value == null || value === 0) return "—";
  if (value >= 1_000_000_000) return `US$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `US$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `US$${(value / 1_000).toFixed(1)}K`;
  return `US$${value.toFixed(0)}`;
}

/** 空状态 */
function EmptyState({ unspscCodes }: { unspscCodes: string[] }) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 mb-4">
          <Database className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 mb-2">
          {t("detail_tabHistory") || "历史中标"}
        </h3>
        <p className="text-sm text-slate-500 mb-3">
          {unspscCodes.length > 0
            ? `暂无 UNSPSC ${unspscCodes.join(" / ")} 品类的历史中标数据`
            : "该公告未关联 UNSPSC 品类编码，无法匹配历史中标数据"}
        </p>
        <p className="text-xs text-slate-400">
          中标数据持续收录中，后续将自动更新
        </p>
      </div>
    </section>
  );
}

/** 汇总卡片 */
function StatsCards({ data }: { data: AwardHistoryData }) {
  const { t } = useLocale();
  const cards = [
    {
      icon: TrendingUp,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-500",
      label: t("detail_histProcureCount") || "同类采购次数",
      value: `${data.total}`,
      sub: t("detail_histProcureCountSub") || "次",
    },
    {
      icon: DollarSign,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-500",
      label: t("detail_histTotalAmount") || "累计采购总额",
      value: formatUsd(data.total_value_usd),
      sub: "USD",
    },
    {
      icon: Globe,
      iconBg: "bg-teal-100",
      iconColor: "text-teal-500",
      label: t("detail_histCountryCount") || "覆盖国家",
      value: `${data.by_country.length}`,
      sub: t("detail_histCountryCountSub") || "个国家/地区",
    },
    {
      icon: Users,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-500",
      label: t("detail_histWinnerCount") || "可追踪中标商",
      value: `${data.top_winners.length}`,
      sub: t("detail_histWinnerCountSub") || "家",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <span className="text-2xs font-bold text-slate-500 uppercase">{card.label}</span>
            </div>
            <p className="text-lg font-extrabold text-slate-900">{card.value}</p>
            <p className="text-2xs text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

/** 国家分布 */
function CountrySection({ data }: { data: AwardHistoryData }) {
  const { t, locale } = useLocale();
  const maxCount = Math.max(...data.by_country.map((c) => c.count), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <h4 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-2">
        <Globe className="w-4 h-4 text-teal-500" />
        {t("detail_histCountryDist") || "采购国家/地区分布"}
      </h4>
      <div className="space-y-2">
        {data.by_country.map((c) => (
          <div key={c.country} className="flex items-center gap-3">
            <span className="w-24 text-xs font-bold text-slate-700 truncate" title={c.country}>
              {getCountryDisplayName(c.country, locale || "zh")}
            </span>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-teal-500 rounded-full transition-all"
                style={{ width: `${(c.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-xs font-bold text-slate-600">{c.count} 次</span>
            <span className="w-20 text-right text-2xs text-slate-400">{formatUsd(c.total_usd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 中标商排行 */
function WinnersSection({ data }: { data: AwardHistoryData }) {
  const { t, locale } = useLocale();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <h4 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-2">
        <Users className="w-4 h-4 text-purple-500" />
        {t("detail_histWinnerRank") || "中标商排行（按金额）"}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 text-slate-400 font-bold w-6">#</th>
              <th className="text-left py-2 text-slate-400 font-bold">{t("detail_histWinnerName") || "中标商"}</th>
              <th className="text-center py-2 text-slate-400 font-bold">{t("detail_histWinnerCountry") || "国家"}</th>
              <th className="text-center py-2 text-slate-400 font-bold">{t("detail_histWinnerBidCount") || "中标次数"}</th>
              <th className="text-right py-2 text-slate-400 font-bold">{t("detail_histWinnerAmount") || "累计金额"}</th>
            </tr>
          </thead>
          <tbody>
            {data.top_winners.map((w, i) => (
              <tr key={w.name} className="border-b border-slate-50 hover:bg-purple-50/30 transition-colors">
                <td className="py-2.5 font-bold text-slate-400">{i + 1}</td>
                <td className="py-2.5">
                  <span className="font-bold text-slate-800">
                    {(locale === "zh" && w.name_cn) || w.name}
                  </span>
                  {w.name_cn && locale === "zh" && w.name_cn !== w.name && (
                    <span className="text-slate-400 ml-1.5 text-2xs">({w.name})</span>
                  )}
                </td>
                <td className="py-2.5 text-center text-slate-600">
                  {w.country ? getCountryDisplayName(w.country, locale || "zh") : "—"}
                </td>
                <td className="py-2.5 text-center font-bold text-slate-700">{w.count}</td>
                <td className="py-2.5 text-right font-bold text-emerald-600">{formatUsd(w.total_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 最近中标记录 */
function RecentAwardsSection({ data }: { data: AwardHistoryData }) {
  const { t, locale } = useLocale();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <h4 className="text-sm font-extrabold text-slate-800 mb-4 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-500" />
        {t("detail_histRecentAwards") || "最近中标记录"}
      </h4>
      <div className="space-y-3">
        {data.recent_awards.map((award) => (
          <div key={award.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3.5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h5 className="text-sm font-bold text-slate-800 line-clamp-2 flex-1">
                {(locale === "zh" && award.title_cn) || award.title}
              </h5>
              <span className="shrink-0 text-sm font-extrabold text-emerald-600">
                {formatUsd(award.contract_value_usd)}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-slate-500 mb-2">
              {award.agency && (
                <span>{t("detail_histAgency") || "采购方"}: <b className="text-slate-600">{award.agency}</b></span>
              )}
              {award.country && (
                <span>{t("detail_histCountry") || "国家"}: <b className="text-slate-600">{getCountryDisplayName(award.country, locale || "zh")}</b></span>
              )}
              {award.award_date && (
                <span>{t("detail_histAwardDate") || "中标日期"}: <b className="text-slate-600">{award.award_date}</b></span>
              )}
              {award.category && (
                <span>{t("detail_histCategory") || "品类"}: <b className="text-slate-600">{award.category}</b></span>
              )}
            </div>
            {award.winners.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100">
                <span className="text-2xs text-slate-400 font-bold">{t("detail_histWinners") || "中标商"}:</span>
                {award.winners.map((w) => (
                  <span key={w.name} className="inline-flex items-center gap-1 text-2xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100">
                    {(locale === "zh" && w.name_cn) || w.name}
                    {w.country && (
                      <span className="text-purple-400">({getCountryDisplayName(w.country, locale || "zh")})</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 主组件 */
export function AwardHistoryTab({ noticeId }: AwardHistoryTabProps) {
  const { data, loading, error, triggerFetch } = useAwardHistory(noticeId);

  // Tab 切换到时自动触发请求
  useEffect(() => {
    if (!data && !loading) {
      triggerFetch();
    }
  }, [noticeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载中
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">正在查询同类品类历史中标数据...</p>
          <p className="text-2xs text-slate-400 mt-1">基于 UNSPSC 编码匹配，可能需要数秒</p>
        </div>
      </section>
    );
  }

  // 错误
  if (error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 mb-2">查询失败</h3>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={triggerFetch}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-sm font-bold transition-colors"
          >
            重试
          </button>
        </div>
      </section>
    );
  }

  // 无数据
  if (data && data.total === 0) {
    return <EmptyState unspscCodes={data.unspsc_matched} />;
  }

  // 有数据
  if (data) {
    return (
      <div className="space-y-5">
        {/* UNSPSC 匹配提示 */}
        {data.unspsc_matched.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>
              基于 UNSPSC 编码 <b className="text-slate-700">{data.unspsc_matched.join(" / ")}</b> 匹配到 <b className="text-teal-600">{data.total}</b> 条同类品类的历史中标记录
            </span>
          </div>
        )}

        <StatsCards data={data} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {data.by_country.length > 0 && <CountrySection data={data} />}
          {data.top_winners.length > 0 && <WinnersSection data={data} />}
        </div>

        {data.recent_awards.length > 0 && <RecentAwardsSection data={data} />}
      </div>
    );
  }

  return null;
}
