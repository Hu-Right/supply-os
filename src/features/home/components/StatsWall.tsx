/**
 * 实时数字墙 — 4 个规模指标
 * Stats Wall — 4 Real-time Scale Indicators
 *
 * @module features/home/components/StatsWall
 * @description 消费 useHomeStats 统一数据源，纯展示组件，
 *              每个指标带数字跳动动画。
 */
import { Search, Globe, TrendingUp, ShieldCheck } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useCountUp } from "@/shared/hooks/useCountUp";
import { useHomeStats } from "../hooks/useHomeStats";
import { formatPlainNumber } from "@/shared/utils/format";

/** 单个统计卡片 — 带数字跳动动画 */
function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number; sub: string; icon: typeof Globe; color: string;
}) {
  const animatedValue = useCountUp(value);
  return (
    <div className="text-center group">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2 group-hover:bg-slate-200 transition-colors">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-2xl md:text-3xl font-extrabold text-slate-900">{formatPlainNumber(animatedValue)}</p>
      <p className="text-xs font-bold text-slate-700 mt-1">{label}</p>
      <p className="text-2xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

/** 实时数字墙 — 消费 useHomeStats，纯展示组件 */
export function StatsWall() {
  const { t } = useLocale();
  const { noticeActive, noticeTodayNew, countryCount, certifiedSupplierCount } = useHomeStats();

  const stats = [
    { label: t("homeStatTotal"), value: noticeActive, sub: t("homeStatTotalSub"), icon: Globe, color: "text-teal-600" },
    { label: t("homeStatDaily"), value: noticeTodayNew, sub: t("homeStatDailySub"), icon: TrendingUp, color: "text-blue-600" },
    { label: t("homeStatSources"), value: countryCount, sub: t("homeStatSourcesSub"), icon: Search, color: "text-purple-600" },
    { label: t("homeStatSuppliers"), value: certifiedSupplierCount, sub: t("homeStatSuppliersSub"), icon: ShieldCheck, color: "text-emerald-600" },
  ];

  return (
    <section className="bg-white border-b border-slate-200 py-10 px-4">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>
    </section>
  );
}
