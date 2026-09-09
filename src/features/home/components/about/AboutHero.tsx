/**
 * 平台介绍 — Hero 区 + 数据指标
 * About Hero — Platform intro + scale metrics
 *
 * @module features/home/components/about/AboutHero
 * @description 品牌标语 + 4 个核心数据指标卡片，消费 useHomeStats。
 */
import { formatCompactNumber } from "@/shared/utils/format";
import { useHomeStats } from "../../hooks/useHomeStats";

export function AboutHero() {
  const { noticeActive, countryCount, certifiedSupplierCount } = useHomeStats();

  const metrics = [
    { value: formatCompactNumber(noticeActive), label: "实时采购公告", sub: "每日持续更新" },
    { value: `${countryCount}+`, label: "覆盖国家/地区", sub: "联合国 & 国际组织" },
    { value: formatCompactNumber(certifiedSupplierCount), label: "认证供应商", sub: "企业资质已核验" },
    { value: "13.5万亿$", label: "全球采购规模", sub: "2026 年全球统计" },
  ];

  return (
    <>
      {/* ── Hero 区 ── */}
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-8 pt-20 pb-12 md:pt-28 md:pb-16 text-center">
        <p className="text-5xl font-semibold text-teal-600 tracking-widest uppercase mb-5">
          云境·国际采购平台
        </p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-neutral-900 tracking-tight leading-tight">
          连接中国供应商
          <br className="hidden sm:block" />
          <span className="text-teal-600"> 与全球公共采购市场</span>
        </h2>
        <p className="mt-6 text-base md:text-lg text-neutral-500 max-w-2xl mx-auto leading-relaxed">
          聚合联合国、世界银行及多国政府采购数据，AI 智能匹配 + 专业投标支持，
          助力中国企业高效出海
        </p>
      </div>

      {/* ── 数据指标 ── */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-8 pb-20 md:pb-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl border border-neutral-100 bg-white p-6 md:p-7 text-center shadow-sm">
              <p className="text-2xl md:text-3xl font-bold text-teal-600 tracking-tight">
                {m.value}
              </p>
              <p className="mt-2 text-sm font-semibold text-neutral-800">{m.label}</p>
              <p className="mt-1 text-xs text-neutral-400">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
