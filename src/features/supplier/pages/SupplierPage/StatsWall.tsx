/**
 * 统计墙 — 实时供应商数据统计展示
 * @module features/supplier/pages/SupplierPage/StatsWall
 */
interface StatItem {
  value: number;
  label: string;
}

interface StatsWallProps {
  stats: StatItem[];
  realtimeLabel: string;
}

export function StatsWall({ stats, realtimeLabel }: StatsWallProps) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl bg-white border border-slate-200 px-5 py-4 shadow-xs text-center">
          <p className="text-xs text-slate-400 font-bold">[{realtimeLabel}]</p>
          <p className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">{s.value.toLocaleString()}+</p>
          <p className="text-xs text-slate-500 mt-1">{s.label}</p>
        </div>
      ))}
    </section>
  );
}
