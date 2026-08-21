/**
 * 开课安排表格区（期次从 DB 动态读取）
 * Schedule Section
 *
 * @module features/training/components/ScheduleSection
 * @description 无期次数据时不渲染。状态徽章按 status 映射 i18n 文案。
 */

import { useLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";
import type { LandingSchedule } from "../api";

export interface ScheduleSectionProps {
  schedules: LandingSchedule[];
}

const STATUS_STYLE: Record<string, string> = {
  enrolling: "bg-teal-100 text-teal-800",
  coming_soon: "bg-slate-100 text-slate-500",
  full: "bg-amber-100 text-amber-800",
  closed: "bg-rose-100 text-rose-700",
};

export function ScheduleSection({ schedules }: ScheduleSectionProps) {
  const { t } = useLocale();
  if (schedules.length === 0) return null;

  const statusLabel = (status: string) => {
    switch (status) {
      case "enrolling": return t("tlStatusEnrolling");
      case "full": return t("tlStatusFull");
      case "closed": return t("tlStatusClosed");
      default: return t("tlStatusComingSoon");
    }
  };

  const formatDate = (d: string | Date) => {
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return String(d);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <section className="py-4">
      <SectionTitle title={t("tlScheduleTitle")} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-left text-white">
                <th className="px-4 py-3 font-bold">{t("tlSchedulePeriod")}</th>
                <th className="px-4 py-3 font-bold">{t("tlScheduleDate")}</th>
                <th className="px-4 py-3 font-bold">{t("tlScheduleCity")}</th>
                <th className="px-4 py-3 font-bold">{t("tlScheduleFormat")}</th>
                <th className="px-4 py-3 font-bold">{t("tlScheduleStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-900">第{s.period_number}期</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(s.start_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{s.city}</td>
                  <td className="px-4 py-3 text-slate-600">{s.format || t("tlScheduleOffline")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[s.status] || STATUS_STYLE.coming_soon}`}>
                      {statusLabel(s.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">{t("tlScheduleNote")}</p>
    </section>
  );
}

ScheduleSection.displayName = "ScheduleSection";
