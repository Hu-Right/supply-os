/**
 * 浮动导航组件（Apple 风格 — 毛玻璃 + 柔和中性色）
 * Floating Navigation (Apple-inspired frosted glass + soft neutral palette)
 *
 * @module features/training/components/FloatingNav
 * @description 桌面端：右侧垂直侧边栏（白色毛玻璃）；移动端：底部水平导航栏（白色毛玻璃）。
 *              始终可见，不随页面滚动消失。保留所有锚点跳转和按钮功能。
 */
import { useLocale } from "@/core/i18n";
import {
  BookOpen,
  FileText,
  Users,
  Calendar,
  MessageSquareQuote,
  HelpCircle,
  PenLine,
  Headphones,
} from "lucide-react";

const ANCHORS = [
  { id: "intro", labelKey: "tlNavIntro", icon: BookOpen },
  { id: "syllabus", labelKey: "tlNavSyllabus", icon: FileText },
  { id: "instructors", labelKey: "tlNavInstructors", icon: Users },
  { id: "schedule", labelKey: "tlNavSchedule", icon: Calendar },
  { id: "testimonials", labelKey: "tlNavTestimonials", icon: MessageSquareQuote },
  { id: "faq", labelKey: "tlNavFaq", icon: HelpCircle },
] as const;

export interface FloatingNavProps {
  onEnroll: () => void;
  onConsult: () => void;
}

export default function FloatingNav({ onEnroll, onConsult }: FloatingNavProps) {
  const { t } = useLocale();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      {/* ─ 桌面端：右侧垂直侧边栏 — Apple 风格毛玻璃 ── */}
      <nav
        className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-50 flex-col gap-0.5 rounded-2xl bg-white/80 backdrop-blur-xl px-2.5 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-slate-200/50"
        aria-label="页面导航"
      >
        {/* 锚点链接 */}
        {ANCHORS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-150 cursor-pointer"
            title={t(labelKey)}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-medium whitespace-nowrap">
              {t(labelKey)}
            </span>
          </button>
        ))}

        {/* 分割线 */}
        <div className="my-1.5 border-t border-slate-200/60" />

        {/* 立即报名 */}
        <button
          type="button"
          onClick={onEnroll}
          className="flex items-center gap-2.5 rounded-xl bg-[#0CAF8C] px-2.5 py-2 text-white hover:bg-[#0A9B7C] transition-colors duration-150 cursor-pointer"
          title={t("tlNavEnroll")}
        >
          <PenLine className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="text-xs font-semibold whitespace-nowrap">{t("tlNavEnroll")}</span>
        </button>

        {/* 咨询顾问 */}
        <button
          type="button"
          onClick={onConsult}
          className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-2.5 py-2 text-slate-600 hover:bg-slate-50 transition-colors duration-150 cursor-pointer"
          title={t("tlNavConsult")}
        >
          <Headphones className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="text-xs font-semibold whitespace-nowrap">{t("tlNavConsult")}</span>
        </button>
      </nav>

      {/* ── 移动端：底部水平导航栏 — Apple 风格 ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
        aria-label="页面导航"
      >
        <div className="flex items-center justify-around px-1 py-2">
          {/* 锚点链接 */}
          {ANCHORS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-slate-400 hover:text-slate-900 active:bg-slate-100 transition-colors duration-150 cursor-pointer min-w-0"
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              <span className="text-[10px] font-medium truncate max-w-full">{t(labelKey)}</span>
            </button>
          ))}

          {/* 立即报名 */}
          <button
            type="button"
            onClick={onEnroll}
            className="flex flex-col items-center gap-0.5 rounded-lg bg-[#0CAF8C] px-2 py-1.5 text-white active:bg-[#0A9B7C] transition-colors duration-150 cursor-pointer min-w-0"
          >
            <PenLine className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span className="text-[10px] font-semibold truncate max-w-full">{t("tlNavEnroll")}</span>
          </button>

          {/* 咨询顾问 */}
          <button
            type="button"
            onClick={onConsult}
            className="flex flex-col items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-600 active:bg-slate-50 transition-colors duration-150 cursor-pointer min-w-0"
          >
            <Headphones className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span className="text-[10px] font-semibold truncate max-w-full">{t("tlNavConsult")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

FloatingNav.displayName = "FloatingNav";
