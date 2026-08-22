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

/** 地球装饰（earth.png 透明底，右侧融入藏青背景） Earth decoration */
function GlobeDots() {
  return (
    <img
      src="/earth.png"
      alt=""
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto object-contain opacity-95 hidden lg:block"
      style={{
        maskImage: "linear-gradient(to right, transparent 0%, black 45%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 45%)",
      }}
    />
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
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <GlobeDots />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
          {course ? pickLocale(locale, course.name_zh, course.name_en) : t("tlFootBrandCourse")}
        </h1>
        <p className="mt-6 text-xl md:text-2xl font-semibold text-slate-700 tracking-tight">{t("tlHeroSubtitle")}</p>
        <p className="mt-6 max-w-2xl text-base md:text-lg leading-relaxed text-slate-500">
          {course?.description_zh || course?.description_en
            ? pickLocale(locale, course.description_zh || "", course.description_en)
            : t("tlHeroDesc")}
        </p>

        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
          {chips.map(({ icon: Icon, key }) => (
            <span key={key} className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Icon className="w-4 h-4 text-slate-400" />
              {t(key)}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onEnroll}
            className="rounded-full bg-[#0CAF8C] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#0A9B7C] hover:scale-105 transition-all duration-200 cursor-pointer shadow-sm"
          >
            {t("tlHeroBtnEnroll")}
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="rounded-full border border-slate-300 px-8 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 cursor-pointer"
          >
            {t("tlHeroBtnConsult")}
          </button>
        </div>

        <p className="mt-10 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Users className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-600">{t("tlHeroAudience")}</span>
          {t("tlHeroAudienceList")}
        </p>
      </div>
    </section>
  );
}
