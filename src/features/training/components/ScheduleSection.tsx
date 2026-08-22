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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24 grid lg:grid-cols-2 gap-16 items-start">
        {/* 左：开课安排表 */}
        <div>
          <h3 className="text-xl md:text-2xl font-extrabold text-slate-900 text-center">{t("tlSchTitle")}</h3>
          {schedules.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="px-5 py-3.5 text-left font-semibold">{t("tlSchPeriod")}</th>
                    <th className="px-5 py-3.5 text-left font-semibold">{t("tlSchDate")}</th>
                    <th className="px-5 py-3.5 text-left font-semibold">{t("tlSchCity")}</th>
                    <th className="px-5 py-3.5 text-left font-semibold">{t("tlSchFormat")}</th>
                    <th className="px-5 py-3.5 text-left font-semibold">{t("tlSchStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-t border-slate-50">
                      <td className="px-5 py-3.5 font-bold text-slate-900">{t("tlSchPeriodNo").replace("{n}", String(s.period_number))}</td>
                      <td className="px-5 py-3.5 text-slate-500">{fmtDate(s.start_date, locale)}</td>
                      <td className="px-5 py-3.5 text-slate-500">{s.city}</td>
                      <td className="px-5 py-3.5 text-slate-500">{s.format}</td>
                      <td className={`px-5 py-3.5 font-semibold ${s.status === "open" ? "text-[#0CAF8C]" : "text-slate-400"}`}>
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
          <h3 className="text-xl md:text-2xl font-extrabold text-slate-900 text-center">{t("tlFeeTitle")}</h3>
          {course && (
            <div className="mt-8 overflow-hidden rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
              {/* 上部柔和藏青：课程名 + 价格 + 副标题 */}
              <div className="bg-slate-800 p-8 text-white text-center">
                <p className="text-base font-bold">{pickLocale(locale, course.name_zh, course.name_en)}</p>
                <p className="mt-4 text-4xl font-extrabold">
                  <span className="align-top text-xl">¥</span>
                  {course.unit_price.toLocaleString("zh-CN")}
                  <span className="ml-1 text-base font-normal text-slate-300">{t("tlPricePerPerson")}</span>
                </p>
                <p className="mt-3 text-center text-xs text-slate-400">{t("tlFeeSub")}</p>
              </div>
              {/* 下部白色：权益清单 + 按钮 */}
              <div className="bg-white p-8">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {(course.includes || []).map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[#0CAF8C]" strokeWidth={2.5} />
                      <span className="text-sm text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onReserve}
                  className="mt-7 w-full rounded-full bg-[#0CAF8C] py-3.5 text-sm font-semibold text-white hover:bg-[#0A9B7C] hover:scale-[1.02] transition-all duration-200 cursor-pointer"
                >
                  {t("tlFeeBtn")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
