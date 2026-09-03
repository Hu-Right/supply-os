/**
 * 开课安排 + 费用卡（设计图 1:1 双栏）
 * Schedule & pricing section
 *
 * @module features/training/components/ScheduleSection
 * @description 左侧期次表（DB）；右侧深藏青费用卡（单价/包含内容 DB 驱动）。
 */
import { Check } from "lucide-react";
import { useLocale, pickLocale, type LocaleKey } from "@/core/i18n";
import { formatScheduleDate } from "@/shared/utils/format";
import type { LandingCourse, LandingSchedule } from "../api";

export interface ScheduleSectionProps {
  schedules: LandingSchedule[];
  course: LandingCourse | null;
  onReserve: () => void;
}

export function ScheduleSection({ schedules, course, onReserve }: ScheduleSectionProps) {
  const { t, locale } = useLocale();

  // 展示所有期次（含已截止、报名中、即将开课）
  const visibleSchedules = schedules;

  const getStatusKey = (status: string): LocaleKey => {
    if (status === "open") return "tlSchOpen";
    if (status === "closed") return "tlSchClosed";
    return "tlSchSoon";
  };

  const getStatusColor = (status: string): string => {
    if (status === "open") return "text-training-green";
    if (status === "closed") return "text-slate-400";
    return "text-[#F59E0B]";
  };

  return (
    <section id="schedule" className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 grid lg:grid-cols-2 gap-12 items-start">
        {/* 左：开课安排表 */}
        <div>
          <h3 className="text-lg md:text-xl font-black text-training-navy text-center">{t("tlSchTitle")}</h3>
          {visibleSchedules.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-lg border border-training-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#183252] text-white">
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchPeriod")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchDate")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchCity")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchFormat")}</th>
                    <th className="px-4 py-3 text-left font-bold">{t("tlSchStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSchedules.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-training-navy">{t("tlSchPeriodNo").replace("{n}", String(s.period_number))}</td>
                      <td className="px-4 py-3 text-slate-600">{formatScheduleDate(s.start_date, locale)}</td>
                      <td className="px-4 py-3 text-slate-600">{s.city}</td>
                      <td className="px-4 py-3 text-slate-600">{s.format}</td>
                      <td className={`px-4 py-3 font-bold ${getStatusColor(s.status)}`}>
                        {t(getStatusKey(s.status))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-600">{t("tlSchNote")}</p>
        </div>

        {/* 右：费用卡 */}
        <div>
          <h3 className="text-lg md:text-xl font-black text-training-navy text-center">{t("tlFeeTitle")}</h3>
          {course && (
            <div className="mt-6 overflow-hidden rounded-lg shadow-[0_4px_16px_rgba(10,42,85,0.10)]">
              {/* 上部藏青：课程名 + 价格 + 副标题 */}
              <div className="bg-[#11437E] p-6 text-white text-center">
                <p className="text-base font-black">{pickLocale(locale, course.name_zh, course.name_en)}</p>
                <p className="mt-3 text-4xl font-black">
                  <span className="align-top text-xl">¥</span>
                  {course.unit_price.toLocaleString("zh-CN")}
                  <span className="ml-1 text-base font-bold text-slate-300">{t("tlPricePerPerson")}</span>
                </p>
                <p className="mt-2 text-center text-xs text-slate-300">{t("tlFeeSub")}</p>
              </div>
              {/* 下部白色：权益清单 + 按钮 */}
              <div className="bg-white p-6">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                  {(course.includes || []).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-training-green" strokeWidth={3} />
                      <span className="text-xs font-bold text-[#3E5070]">{item}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onReserve}
                  className="mt-6 w-full rounded-md bg-training-green py-3 text-sm font-black text-white hover:bg-training-green-hover cursor-pointer"
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
