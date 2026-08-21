/**
 * 课程大纲区（三模块时间线）
 * Syllabus Section
 *
 * @module features/training/components/SyllabusSection
 */

import { CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";

export function SyllabusSection() {
  const { t } = useLocale();
  const modules = [
    {
      no: 1,
      title: t("tlModule1Title"),
      items: [t("tlModule1Item1"), t("tlModule1Item2"), t("tlModule1Item3"), t("tlModule1Item4")],
    },
    {
      no: 2,
      title: t("tlModule2Title"),
      items: [t("tlModule2Item1"), t("tlModule2Item2"), t("tlModule2Item3"), t("tlModule2Item4")],
    },
    {
      no: 3,
      title: t("tlModule3Title"),
      items: [t("tlModule3Item1"), t("tlModule3Item2"), t("tlModule3Item3"), t("tlModule3Item4")],
    },
  ];

  return (
    <section className="py-4">
      <SectionTitle title={t("tlSyllabusTitle")} />
      <div className="relative space-y-6">
        {/* 时间线竖线 */}
        <div className="absolute top-2 bottom-2 left-5 hidden w-px bg-teal-200 md:block" />
        {modules.map((m) => (
          <div key={m.no} className="relative md:pl-14">
            <div className="absolute top-0 left-0 hidden h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-base font-black text-white md:flex">
              {m.no}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-sm font-black text-white md:hidden">{m.no}</span>
                {m.title}
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {m.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

SyllabusSection.displayName = "SyllabusSection";
