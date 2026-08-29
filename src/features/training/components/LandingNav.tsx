/**
 * 落地页顶部锚点导航（设计图 1:1 深藏青条）
 * Landing anchor nav bar
 *
 * @module features/training/components/LandingNav
 * @description 品牌名 + 六个锚点链接 + 立即报名（绿）/ 咨询顾问（描边）按钮。
 */
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";

const ANCHORS = [
  ["intro", "tlNavIntro"],
  ["syllabus", "tlNavSyllabus"],
  ["instructors", "tlNavInstructors"],
  ["schedule", "tlNavSchedule"],
  ["testimonials", "tlNavTestimonials"],
  ["faq", "tlNavFaq"],
] as const;

export interface LandingNavProps {
  onEnroll: () => void;
  onConsult: () => void;
}

export function LandingNav({ onEnroll, onConsult }: LandingNavProps) {
  const { t } = useLocale();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="bg-[#001636] text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <span className="text-sm font-bold text-white whitespace-nowrap">{t("tlFootBrand")}</span>
        <div className="flex items-center gap-0.5 md:gap-1.5 overflow-x-auto scrollbar-none">
          {ANCHORS.map(([id, key]) => (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => go(id)}
              className="px-2.5 py-1.5 font-medium text-slate-300 hover:text-white hover:bg-transparent whitespace-nowrap cursor-pointer"
            >
              {t(key)}
            </Button>
          ))}
          <button
            type="button"
            onClick={onEnroll}
            className="ml-2 rounded bg-[#0CAF8C] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#0A9B7C] whitespace-nowrap cursor-pointer"
          >
            {t("tlNavEnroll")}
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onConsult}
            className="ml-1 rounded border-slate-400/60 px-4 py-1.5 text-slate-100 hover:bg-white/10 whitespace-nowrap cursor-pointer"
          >
            {t("tlNavConsult")}
          </Button>
        </div>
      </div>
    </div>
  );
}
