/**
 * 落地页 Hero 区（深蓝背景 + 标题 + 双 CTA 按钮）
 * Landing Page Hero Section
 *
 * @module features/training/components/HeroSection
 * @description 标题/描述从 DB 课程数据读取（无课程时显示默认文案），
 *              双 CTA 按钮触发报名与咨询弹窗。
 */

import { CalendarDays, MapPin, FileText, Target, Users } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import type { LandingCourse } from "../api";

export interface HeroSectionProps {
  course: LandingCourse | null;
  onEnroll: () => void;
  onConsult: () => void;
}

export function HeroSection({ course, onEnroll, onConsult }: HeroSectionProps) {
  const { t, locale } = useLocale();
  const title = course ? pickLocale(locale, course.name_zh, course.name_en) : t("tlHeroTitle");
  const desc = course ? pickLocale(locale, course.description_zh || "", course.description_en || "") : t("tlHeroDesc");

  const tags = [
    { icon: CalendarDays, label: t("tlHeroTag1") },
    { icon: MapPin, label: t("tlHeroTag2") },
    { icon: FileText, label: t("tlHeroTag3") },
    { icon: Target, label: t("tlHeroTag4") },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 text-white md:p-14">
      {/* 装饰光斑 */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative">
        <span className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-400/10 px-3 py-1 text-xs font-bold text-teal-300">
          {t("tlHeroBadge")}
        </span>

        <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">{title}</h1>
        <p className="mt-3 text-lg font-bold text-teal-300 md:text-xl">{t("tlHeroSubtitle")}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">{desc || t("tlHeroDesc")}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          {tags.map((tag) => (
            <span key={tag.label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200">
              <tag.icon className="h-3.5 w-3.5 text-teal-400" />
              {tag.label}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onEnroll}
            className="rounded-xl bg-teal-500 px-8 py-3.5 text-sm font-black text-slate-900 shadow-lg shadow-teal-500/30 transition-all hover:bg-teal-400"
          >
            {t("tlBtnEnroll")}
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="rounded-xl border border-white/30 bg-white/5 px-8 py-3.5 text-sm font-black text-white transition-all hover:bg-white/10"
          >
            {t("tlBtnConsult")}
          </button>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
          <Users className="h-4 w-4 text-teal-400" />
          {t("tlHeroSuitable")}
        </p>
      </div>
    </section>
  );
}

HeroSection.displayName = "HeroSection";
