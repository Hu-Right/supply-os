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
/* NOTE: 保留原生 <img> — 装饰性图片使用 h-[140%] w-auto 及 mask-image，next/image 不支持此模式 */
function GlobeDots() {
  return (
    <img
      src="/earth.png?v=2"
      alt=""
      aria-hidden
      className="pointer-events-none absolute -right-[3%] top-1/2 -translate-y-1/2 h-[140%] w-auto object-contain opacity-95 hidden lg:block"
      style={{
        maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 20%, black 45%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 20%, black 45%)",
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
    <section className="relative overflow-hidden bg-[#022049] text-white">
      <GlobeDots />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <h1 className="text-3xl md:text-5xl font-black tracking-wide">
          {course ? pickLocale(locale, course.name_zh, course.name_en) : t("tlFootBrandCourse")}
        </h1>
        <p className="mt-5 text-lg md:text-2xl font-bold text-white tracking-wider">{t("tlHeroSubtitle")}</p>
        <p className="mt-5 max-w-2xl text-sm md:text-base leading-relaxed text-slate-300">
          {course?.description_zh || course?.description_en
            ? pickLocale(locale, course.description_zh || "", course.description_en)
            : t("tlHeroDesc")}
        </p>

        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
          {chips.map(({ icon: Icon, key }) => (
            <span key={key} className="inline-flex items-center gap-2 text-sm text-slate-200">
              <Icon className="w-4 h-4 text-slate-100" />
              {t(key)}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onEnroll}
            className="rounded-md bg-[#0CAF8C] px-8 py-3 text-base font-black text-white hover:bg-[#0A9B7C] cursor-pointer"
          >
            {t("tlHeroBtnEnroll")}
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="rounded-md border border-slate-400/70 px-8 py-3 text-base font-black text-slate-100 hover:bg-white/10 cursor-pointer"
          >
            {t("tlHeroBtnConsult")}
          </button>
        </div>

        <p className="mt-8 flex flex-wrap items-center gap-2 text-xs md:text-sm text-slate-300">
          <Users className="w-4 h-4 text-slate-200" />
          <span className="font-bold text-slate-200">{t("tlHeroAudience")}</span>
          {t("tlHeroAudienceList")}
        </p>
      </div>
    </section>
  );
}
