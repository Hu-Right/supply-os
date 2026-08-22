/**
 * 课程大纲（设计图 1:1 左侧三模块时间线）
 * Syllabus section
 *
 * @module features/training/components/SyllabusSection
 * @description 与 ParticipationSection 同处一个双栏带；编号圆点 + 竖向连接线。
 */
import { useLocale, type LocaleKey } from "@/core/i18n";

const MODULES: { titleKey: LocaleKey; itemKeys: LocaleKey[] }[] = [
  { titleKey: "tlSylM1", itemKeys: ["tlSylM1i1", "tlSylM1i2", "tlSylM1i3", "tlSylM1i4"] },
  { titleKey: "tlSylM2", itemKeys: ["tlSylM2i1", "tlSylM2i2", "tlSylM2i3", "tlSylM2i4"] },
  { titleKey: "tlSylM3", itemKeys: ["tlSylM3i1", "tlSylM3i2", "tlSylM3i3", "tlSylM3i4"] },
];

export function SyllabusSection() {
  const { t } = useLocale();

  return (
    <div className="flex h-full flex-col">
      <h3 className="text-xl md:text-2xl font-extrabold text-slate-900">{t("tlSylTitle")}</h3>
      <div className="mt-8 flex-1 flex flex-col gap-8">
        {MODULES.map((mod, idx) => (
          <div key={mod.titleKey} className="relative flex gap-5 flex-1">
            {/* 编号圆点 + 连接线 */}
            <div className="flex flex-col items-center">
              <span className="w-9 h-9 shrink-0 rounded-full bg-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              {idx < MODULES.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-2" />}
            </div>
            <div className="flex-1 rounded-2xl bg-[#FAFBFC] p-6">
              <h4 className="text-base font-bold text-slate-900">{t(mod.titleKey)}</h4>
              <ul className="mt-4 space-y-2.5">
                {mod.itemKeys.map((k) => (
                  <li key={k} className="flex items-start gap-2.5 text-sm text-slate-500">
                    <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-slate-400" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
