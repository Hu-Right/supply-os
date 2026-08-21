/**
 * 首屏 Hero（设计图 1:1 深藏青 + 点阵地球）
 * Hero section
 *
 * @module features/training/components/HeroSection
 * @description 标题/副标题/描述/四个信任标签/双按钮/适合人群行，
 *              右侧点阵地球装饰。课程名称取自 DB。
 */
import { CalendarDays, MapPin, FileText, Target, Users } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import type { LandingCourse } from "../api";

export interface HeroSectionProps {
  course: LandingCourse | null;
  onEnroll: () => void;
  onConsult: () => void;
}

/** 点阵地球装饰 Dotted globe decoration */
function GlobeDots() {
  return (
    <svg viewBox="0 0 200 200" className="absolute -right-10 top-1/2 -translate-y-1/2 w-[420px] h-[420px] opacity-70 hidden lg:block" aria-hidden>
      <defs>
        <pattern id="tl-dots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.6" cy="1.6" r="1.1" fill="#4C8DFF" opacity="0.55" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#tl-dots)" />
      <circle cx="100" cy="100" r="92" fill="none" stroke="#4C8DFF" strokeOpacity="0.4" />
      <ellipse cx="100" cy="100" rx="92" ry="36" fill="none" stroke="#4C8DFF" strokeOpacity="0.3" />
      <ellipse cx="100" cy="100" rx="36" ry="92" fill="none" stroke="#4C8DFF" strokeOpacity="0.3" />
    </svg>
  );
}

export function HeroSection({ course, onEnroll, onConsult }: HeroSectionProps) {
  const { t, locale } = useLocale();
  const chips = [
    { icon: CalendarDays, key: "tlHeroChip1" },
    { icon: MapPin, key: "tlHeroChip2" },
    { icon: FileText, key: "tlHeroChip3" },
    { icon: Target, key: "tlHeroChip4" },
  ] as const;

  return (
    <section className="relative overflow-hidden bg-[#0B2447] text-white">
      <GlobeDots />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <h1 className="text-3xl md:text-5xl font-black tracking-wide">
          {course ? pickLocale(locale, course.name_zh, course.name_en) : t("tlFootBrandCourse")}
        </h1>
        <p className="mt-5 text-lg md:text-2xl font-bold text-teal-300 tracking-wider">{t("tlHeroSubtitle")}</p>
        <p className="mt-5 max-w-2xl text-sm md:text-base leading-relaxed text-slate-300">
          {course?.description_zh || course?.description_en
            ? pickLocale(locale, course.description_zh || "", course.description_en)
            : t("tlHeroDesc")}
        </p>

        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
          {chips.map(({ icon: Icon, key }) => (
            <span key={key} className="inline-flex items-center gap-2 text-sm text-slate-200">
              <Icon className="w-4 h-4 text-teal-400" />
              {t(key)}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onEnroll}
            className="rounded-lg bg-[#12A171] px-8 py-3 text-base font-black text-white shadow-lg shadow-emerald-900/30 hover:bg-[#0C8A5F] cursor-pointer"
          >
            {t("tlHeroBtnEnroll")}
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="rounded-lg border border-slate-400/70 px-8 py-3 text-base font-black text-slate-100 hover:bg-white/10 cursor-pointer"
          >
            {t("tlHeroBtnConsult")}
          </button>
        </div>

        <p className="mt-8 flex flex-wrap items-center gap-2 text-xs md:text-sm text-slate-300">
          <Users className="w-4 h-4 text-teal-400" />
          <span className="font-bold text-slate-200">{t("tlHeroAudience")}</span>
          {t("tlHeroAudienceList")}
        </p>
      </div>
    </section>
  );
}
