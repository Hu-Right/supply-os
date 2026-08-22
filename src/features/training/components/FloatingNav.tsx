/**
 * 浮动导航组件（固定定位，响应式布局）
 * Floating Navigation (fixed position, responsive layout)
 *
 * @module features/training/components/FloatingNav
 * @description 桌面端：右侧垂直侧边栏；移动端：底部水平导航栏。
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
      {/* ── 桌面端：右侧垂直侧边栏 ── */}
      <nav
        className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-50 flex-col gap-1 rounded-2xl bg-[#001636]/95 backdrop-blur-sm px-2 py-3 shadow-[0_8px_32px_rgba(0,22,54,0.3)]"
        aria-label="页面导航"
      >
        {/* 锚点链接 */}
        {ANCHORS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            className="group flex items-center gap-2 rounded-xl px-2.5 py-2 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title={t(labelKey)}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium whitespace-nowrap">
              {t(labelKey)}
            </span>
          </button>
        ))}

        {/* 分割线 */}
        <div className="my-1 border-t border-white/10" />

        {/* 立即报名 */}
        <button
          type="button"
          onClick={onEnroll}
          className="flex items-center gap-2 rounded-xl bg-[#0CAF8C] px-2.5 py-2 text-white hover:bg-[#0A9B7C] transition-colors cursor-pointer"
          title={t("tlNavEnroll")}
        >
          <PenLine className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">{t("tlNavEnroll")}</span>
        </button>

        {/* 咨询顾问 */}
        <button
          type="button"
          onClick={onConsult}
          className="flex items-center gap-2 rounded-xl border border-white/20 px-2.5 py-2 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          title={t("tlNavConsult")}
        >
          <Headphones className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">{t("tlNavConsult")}</span>
        </button>
      </nav>

      {/* ── 移动端：底部水平导航栏 ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#001636]/95 backdrop-blur-sm border-t border-white/10 shadow-[0_-4px_16px_rgba(0,22,54,0.2)]"
        aria-label="页面导航"
      >
        <div className="flex items-center justify-around px-1 py-1.5">
          {/* 锚点链接 */}
          {ANCHORS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-slate-400 hover:text-white active:bg-white/10 transition-colors cursor-pointer min-w-0"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-medium truncate max-w-full">{t(labelKey)}</span>
            </button>
          ))}

          {/* 立即报名 */}
          <button
            type="button"
            onClick={onEnroll}
            className="flex flex-col items-center gap-0.5 rounded-lg bg-[#0CAF8C] px-2 py-1 text-white active:bg-[#0A9B7C] transition-colors cursor-pointer min-w-0"
          >
            <PenLine className="w-4 h-4 shrink-0" />
            <span className="text-[10px] font-bold truncate max-w-full">{t("tlNavEnroll")}</span>
          </button>

          {/* 咨询顾问 */}
          <button
            type="button"
            onClick={onConsult}
            className="flex flex-col items-center gap-0.5 rounded-lg border border-white/20 px-2 py-1 text-slate-300 active:bg-white/10 transition-colors cursor-pointer min-w-0"
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span className="text-[10px] font-bold truncate max-w-full">{t("tlNavConsult")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

FloatingNav.displayName = "FloatingNav";
