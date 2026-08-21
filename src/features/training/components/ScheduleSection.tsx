/**
 * 开课安排 + 费用卡（设计图 1:1 双栏）
 * Schedule & pricing section
 *
 * @module features/training/components/ScheduleSection
 * @description 左侧期次表（DB）；右侧深藏青费用卡（单价/包含内容 DB 驱动）。
 */
import { Check } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import type { LandingCourse, LandingSchedule } from "../api";

export interface ScheduleSectionProps {
  schedules: LandingSchedule[];
  course: LandingCourse | null;
  onReserve: () => void;
}

/** 期次日期 → 2026年1月20日 格式 */
function fmtDate(d: string | Date, locale: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return locale === "zh"
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function ScheduleSection({ schedules, course, onReserve }: ScheduleSectionProps) {
  const { t, locale } = useLocale();

  return (
    <section id="schedule" className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid lg:grid-cols-2 gap-12 items-start">
        {/* 左：开课安排表 */}
        <div>
          <h3 className="text-lg md:text-xl font-black text-[#0B2447]">{t("tlSchTitle")}</h3>
          {schedules.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0B2447] text-white">
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchPeriod")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchDate")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchCity")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchFormat")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-[#0B2447]">{t("tlSchPeriodNo").replace("{n}", String(s.period_number))}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(s.start_date, locale)}</td>
                      <td className="px-4 py-3 text-slate-600">{s.city}</td>
                      <td className="px-4 py-3 text-slate-600">{s.format}</td>
                      <td className={`px-4 py-3 font-bold ${s.status === "open" ? "text-[#12A171]" : "text-slate-400"}`}>
                        {s.status === "open" ? t("tlSchOpen") : t("tlSchSoon")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">{t("tlSchNote")}</p>
        </div>

        {/* 右：费用卡 */}
        <div>
          <h3 className="text-lg md:text-xl font-black text-[#0B2447]">{t("tlFeeTitle")}</h3>
          {course && (
            <div className="mt-6 rounded-xl bg-[#0B2447] p-8 text-white shadow-lg">
              <p className="text-center text-base font-black">{pickLocale(locale, course.name_zh, course.name_en)}</p>
              <p className="mt-4 text-center text-4xl font-black">
                <span className="align-top text-xl">¥</span>
                {course.unit_price.toLocaleString("zh-CN")}
                <span className="ml-1 text-base font-bold text-slate-300">{t("tlPricePerPerson")}</span>
              </p>
              <p className="mt-2 text-center text-xs text-slate-300">{t("tlFeeSub")}</p>
              <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {(course.includes || []).map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-slate-200">
                    <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[#12A171]" strokeWidth={3} />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onReserve}
                className="mt-8 w-full rounded-lg bg-[#12A171] py-3 text-sm font-black text-white hover:bg-[#0C8A5F] cursor-pointer"
              >
                {t("tlFeeBtn")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
