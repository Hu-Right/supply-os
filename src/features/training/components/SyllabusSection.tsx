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
    <div>
      <h3 className="text-lg md:text-xl font-black text-[#0B2447]">{t("tlSylTitle")}</h3>
      <div className="mt-6 space-y-6">
        {MODULES.map((mod, idx) => (
          <div key={mod.titleKey} className="relative flex gap-4">
            {/* 编号圆点 + 连接线 */}
            <div className="flex flex-col items-center">
              <span className="w-8 h-8 shrink-0 rounded-full bg-[#12A171] text-white text-sm font-black flex items-center justify-center">
                {idx + 1}
              </span>
              {idx < MODULES.length - 1 && <span className="w-px flex-1 bg-teal-600/40 mt-2" />}
            </div>
            <div className="flex-1 rounded-lg border border-slate-200/80 bg-[#F8FAFC] p-5">
              <h4 className="text-sm font-black text-[#0B2447]">{t(mod.titleKey)}</h4>
              <ul className="mt-3 space-y-2">
                {mod.itemKeys.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full bg-[#12A171]" />
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
