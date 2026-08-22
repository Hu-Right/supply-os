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
    <li className="flex items-start gap-2 text-xs text-slate-600">
      <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[#0CAF8C]" strokeWidth={3} />
      {t(k)}
    </li>
  );
}

export function ParticipationSection({ course, onConsult }: ParticipationSectionProps) {
  const { t } = useLocale();

  return (
    <div className="flex h-full flex-col">
      <h3 className="text-lg md:text-xl font-black text-[#0A2A55]">{t("tlPartTitle")}</h3>

      <div className="mt-6 grid sm:grid-cols-2 gap-5">
        {/* A 单人报名 */}
        <div className="rounded-lg border border-[#E5EBF3] bg-white p-6 shadow-[0_4px_16px_rgba(10,42,85,0.06)]">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-md bg-[#0A2A55] text-white font-black flex items-center justify-center">A</span>
            <h4 className="text-base font-black text-[#0A2A55]">{t("tlPartATitle")}</h4>
          </div>
          <p className="mt-2 text-xs text-slate-600">{t("tlPartADesc")}</p>
          <p className="mt-4 text-2xl font-black text-[#069E78]">
            {course ? course.unit_price.toLocaleString("zh-CN") : "2800"}
            <span className="ml-1 text-sm font-bold">{t("tlPricePerPerson")}</span>
          </p>
          <ul className="mt-4 space-y-2">
            {(["tlPartAi1", "tlPartAi2", "tlPartAi3", "tlPartAi4"] as LocaleKey[]).map((k) => <CheckItem key={k} k={k} />)}
          </ul>
        </div>

        {/* B 2-3人组团 */}
        <div className="rounded-lg border border-[#E5EBF3] bg-white p-6 shadow-[0_4px_16px_rgba(10,42,85,0.06)]">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-md bg-[#0A2A55] text-white font-black flex items-center justify-center">B</span>
            <h4 className="text-base font-black text-[#0A2A55]">{t("tlPartBTitle")}</h4>
          </div>
          <p className="mt-2 text-xs text-slate-600">{t("tlPartBDesc")}</p>
          <p className="mt-4 text-xl font-black text-[#069E78]">{t("tlPartBTag")}</p>
          <ul className="mt-4 space-y-2">
            {(["tlPartBi1", "tlPartBi2", "tlPartBi3", "tlPartBi4"] as LocaleKey[]).map((k) => <CheckItem key={k} k={k} />)}
          </ul>
        </div>
      </div>

      {/* C 企业定向深训 */}
      <div className="mt-5 flex-1 rounded-lg border border-[#E5EBF3] bg-white p-6 shadow-[0_4px_16px_rgba(10,42,85,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-8 h-8 rounded-md bg-[#0A2A55] text-white font-black flex items-center justify-center">C</span>
          <h4 className="text-base font-black text-[#0A2A55]">{t("tlPartCTitle")}</h4>
          <span className="text-xs text-slate-600">{t("tlPartCDesc")}</span>
        </div>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {(["tlPartCi1", "tlPartCi2", "tlPartCi3", "tlPartCi4"] as LocaleKey[]).map((k) => <CheckItem key={k} k={k} />)}
        </ul>
        <p
          onClick={onConsult}
          className="mt-5 text-base font-black text-[#069E78] cursor-pointer hover:opacity-80"
        >
          {t("tlPartCTag")}
        </p>
      </div>
    </div>
  );
}
