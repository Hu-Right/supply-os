/**
 * 落地页页脚（设计图 1:1 深藏青）
 * Landing footer
 *
 * @module features/training/components/LandingFooter
 * @description 品牌 + 版权 + 锚点链接。
 */
import { useLocale } from "@/core/i18n";

const LINKS = [
  ["intro", "tlNavIntro"],
  ["syllabus", "tlNavSyllabus"],
  ["instructors", "tlNavInstructors"],
  ["schedule", "tlNavSchedule"],
  ["testimonials", "tlNavTestimonials"],
  ["faq", "tlNavFaq"],
] as const;

export function LandingFooter() {
  const { t } = useLocale();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <footer className="bg-[#041F44] text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold text-white">{t("tlFootBrand")}</span>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {LINKS.map(([id, key]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className="text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-5 text-xs text-slate-400">{t("tlFootCopy")}</p>
      </div>
    </footer>
  );
}
