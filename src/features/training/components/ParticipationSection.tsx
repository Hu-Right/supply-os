/**
 * 三种参训方式（设计图 1:1 右侧 A/B/C 卡片）
 * Participation options section
 *
 * @module features/training/components/ParticipationSection
 * @description A 单人报名（DB 单价）/ B 2-3人组团 / C 企业定向深训（咨询定制）。
 */
import { Check } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import type { LandingCourse } from "../api";

export interface ParticipationSectionProps {
  course: LandingCourse | null;
  onReserve: () => void;
  onConsult: () => void;
}

function CheckItem({ k }: { k: LocaleKey }) {
  const { t } = useLocale();
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-500">
      <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[#0CAF8C]" strokeWidth={2.5} />
      {t(k)}
    </li>
  );
}

export function ParticipationSection({ course, onConsult }: ParticipationSectionProps) {
  const { t } = useLocale();

  return (
    <div className="flex h-full flex-col">
      <h3 className="text-xl md:text-2xl font-extrabold text-slate-900">{t("tlPartTitle")}</h3>

      <div className="mt-8 grid sm:grid-cols-2 gap-6">
        {/* A 单人报名 */}
        <div className="rounded-2xl bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-shadow duration-300">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm">A</span>
            <h4 className="text-base font-bold text-slate-900">{t("tlPartATitle")}</h4>
          </div>
          <p className="mt-3 text-sm text-slate-500">{t("tlPartADesc")}</p>
          <p className="mt-5 text-2xl font-extrabold text-slate-900">
            {course ? course.unit_price.toLocaleString("zh-CN") : "2800"}
            <span className="ml-1 text-sm font-normal text-slate-500">{t("tlPricePerPerson")}</span>
          </p>
          <ul className="mt-5 space-y-2.5">
            {(["tlPartAi1", "tlPartAi2", "tlPartAi3", "tlPartAi4"] as LocaleKey[]).map((k) => <CheckItem key={k} k={k} />)}
          </ul>
        </div>

        {/* B 2-3人组团 */}
        <div className="rounded-2xl bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-shadow duration-300">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm">B</span>
            <h4 className="text-base font-bold text-slate-900">{t("tlPartBTitle")}</h4>
          </div>
          <p className="mt-3 text-sm text-slate-500">{t("tlPartBDesc")}</p>
          <p className="mt-5 text-xl font-extrabold text-slate-900">{t("tlPartBTag")}</p>
          <ul className="mt-5 space-y-2.5">
            {(["tlPartBi1", "tlPartBi2", "tlPartBi3", "tlPartBi4"] as LocaleKey[]).map((k) => <CheckItem key={k} k={k} />)}
          </ul>
        </div>
      </div>

      {/* C 企业定向深训 */}
      <div className="mt-6 flex-1 rounded-2xl bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-shadow duration-300">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm">C</span>
          <h4 className="text-base font-bold text-slate-900">{t("tlPartCTitle")}</h4>
          <span className="text-sm text-slate-500">{t("tlPartCDesc")}</span>
        </div>
        <ul className="mt-5 grid sm:grid-cols-2 gap-2.5">
          {(["tlPartCi1", "tlPartCi2", "tlPartCi3", "tlPartCi4"] as LocaleKey[]).map((k) => <CheckItem key={k} k={k} />)}
        </ul>
        <p
          onClick={onConsult}
          className="mt-6 text-base font-bold text-[#0CAF8C] cursor-pointer hover:opacity-80 transition-opacity"
        >
          {t("tlPartCTag")}
        </p>
      </div>
    </div>
  );
}
