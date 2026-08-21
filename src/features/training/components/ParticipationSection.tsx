/**
 * 参训方式 + 费用区（价格从 DB 动态读取）
 * Participation Section
 *
 * @module features/training/components/ParticipationSection
 * @description 三种参训方式卡片 + 费用卡片（单价/包含内容来自 training_courses）。
 *              无课程数据时隐藏费用卡片。
 */

import { CheckCircle2, User, Users, Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";
import type { LandingCourse } from "../api";

export interface ParticipationSectionProps {
  course: LandingCourse | null;
  onReserve: () => void;
  onConsult: () => void;
}

export function ParticipationSection({ course, onReserve, onConsult }: ParticipationSectionProps) {
  const { t } = useLocale();

  const planB = [t("tlPlanBItem1"), t("tlPlanBItem2"), t("tlPlanBItem3"), t("tlPlanBItem4")];
  const planC = [t("tlPlanCItem1"), t("tlPlanCItem2"), t("tlPlanCItem3"), t("tlPlanCItem4")];

  return (
    <section className="py-4">
      <SectionTitle title={t("tlParticipationTitle")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 单人报名 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <User className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black text-slate-900">{t("tlPlanATitle")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("tlPlanADesc")}</p>
          {course && (
            <div className="mt-4 text-2xl font-black text-teal-700">
              ¥{Number(course.unit_price).toFixed(0)}
              <span className="text-sm font-bold text-slate-400">{t("tlPricePerPerson")}</span>
            </div>
          )}
          <ul className="mt-4 space-y-1.5">
            {planB.slice(0, 2).map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" /> {item}
              </li>
            ))}
          </ul>
        </div>

        {/* 组团 */}
        <div className="relative rounded-2xl border-2 border-teal-500 bg-white p-6 shadow-md">
          <span className="absolute -top-3 right-4 rounded-full bg-teal-600 px-3 py-1 text-xs font-black text-white">
            {t("tlPlanBTag")}
          </span>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Users className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black text-slate-900">{t("tlPlanBTitle")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("tlPlanBDesc")}</p>
          <ul className="mt-4 space-y-1.5">
            {planB.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" /> {item}
              </li>
            ))}
          </ul>
        </div>

        {/* 企业内训 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black text-slate-900">{t("tlPlanCTitle")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("tlPlanCDesc")}</p>
          <ul className="mt-4 space-y-1.5">
            {planC.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" /> {item}
              </li>
            ))}
          </ul>
          <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
            {t("tlPlanCTag")}
          </span>
        </div>
      </div>

      {/* 费用卡片（DB 驱动） */}
      {course && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="bg-slate-900 p-6 text-center text-white">
            <h3 className="text-base font-black">{course.name_zh}</h3>
            <div className="mt-2 text-4xl font-black text-teal-400">
              ¥{Number(course.unit_price).toFixed(0)}
              <span className="text-base font-bold text-slate-300">{t("tlPricePerPerson")}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("tlPriceDesc")}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 p-6 sm:grid-cols-2">
            {(course.includes || []).map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500" /> {item}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3 px-6 pb-6">
            <button
              type="button"
              onClick={onReserve}
              className="rounded-xl bg-teal-600 px-8 py-3 text-sm font-black text-white hover:bg-teal-700"
            >
              {t("tlBtnReserve")}
            </button>
            <button
              type="button"
              onClick={onConsult}
              className="rounded-xl border border-slate-300 px-8 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              {t("tlBtnConsult")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

ParticipationSection.displayName = "ParticipationSection";
