/**
 * 浮动导航组件（固定定位，响应式布局）
 * Floating Navigation (fixed position, responsive layout)
 *
 * @module features/training/components/FloatingNav
 * @description 桌面端：右侧垂直侧边栏（完整标签 tlNav*）；移动端：底部水平导航栏
 *              （短标签 mobileNav*，8 项挤一行时完整标签会被 truncate 省略，短标签保证可读）。
 *              始终可见，不随页面滚动消失。保留所有锚点跳转和按钮功能。
 */
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
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
  { id: "intro", labelKey: "tlNavIntro", shortKey: "mobileNavIntro", icon: BookOpen },
  { id: "syllabus", labelKey: "tlNavSyllabus", shortKey: "mobileNavSyllabus", icon: FileText },
  { id: "instructors", labelKey: "tlNavInstructors", shortKey: "mobileNavInstructors", icon: Users },
  { id: "schedule", labelKey: "tlNavSchedule", shortKey: "mobileNavSchedule", icon: Calendar },
  { id: "testimonials", labelKey: "tlNavTestimonials", shortKey: "mobileNavTestimonials", icon: MessageSquareQuote },
  { id: "faq", labelKey: "tlNavFaq", shortKey: "mobileNavFaq", icon: HelpCircle },
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
        className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-50 flex-col gap-1 rounded-2xl bg-training-dark/95 backdrop-blur-sm px-2 py-3 shadow-[0_8px_32px_rgba(0,22,54,0.3)]"
        aria-label={t("navPageNav")}
      >
        {/* 锚点链接 */}
        {ANCHORS.map(({ id, labelKey, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            onClick={() => go(id)}
            className="group gap-2 rounded-xl px-2.5 py-2 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
            title={t(labelKey)}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium whitespace-nowrap">
              {t(labelKey)}
            </span>
          </Button>
        ))}

        {/* 分割线 */}
        <div className="my-1 border-t border-white/10" />

        {/* 立即报名 */}
        <button
          type="button"
          onClick={onEnroll}
          className="flex items-center gap-2 rounded-xl bg-training-green px-2.5 py-2 text-white hover:bg-training-green-hover transition-colors cursor-pointer"
          title={t("tlNavEnroll")}
        >
          <PenLine className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">{t("tlNavEnroll")}</span>
        </button>

        {/* 咨询顾问 */}
        <Button
          type="button"
          variant="outline"
          onClick={onConsult}
          className="gap-2 rounded-xl border-white/20 px-2.5 py-2 text-slate-200 hover:bg-white/10 cursor-pointer"
          title={t("tlNavConsult")}
        >
          <Headphones className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">{t("tlNavConsult")}</span>
        </Button>
      </nav>

      {/* ── 移动端：底部水平导航栏 ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-training-dark/95 backdrop-blur-sm border-t border-white/10 shadow-[0_-4px_16px_rgba(0,22,54,0.2)] pb-[env(safe-area-inset-bottom)]"
        aria-label={t("navPageNav")}
      >
        <div className="flex items-center justify-around px-0.5 py-1.5">
          {/* 锚点链接（短标签防截断，aria-label 保留完整名称） */}
          {ANCHORS.map(({ id, labelKey, shortKey, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant="ghost"
              onClick={() => go(id)}
              aria-label={t(labelKey)}
              className="flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-slate-400 hover:bg-transparent hover:text-white active:bg-white/10 cursor-pointer min-w-0"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-2xs font-medium truncate max-w-full">{t(shortKey)}</span>
            </Button>
          ))}

          {/* 立即报名 */}
          <button
            type="button"
            onClick={onEnroll}
            aria-label={t("tlNavEnroll")}
            className="flex flex-col items-center gap-0.5 rounded-lg bg-training-green px-1 py-1 text-white active:bg-training-green-hover transition-colors cursor-pointer min-w-0"
          >
            <PenLine className="w-4 h-4 shrink-0" />
            <span className="text-2xs font-bold truncate max-w-full">{t("mobileNavEnroll")}</span>
          </button>

          {/* 咨询顾问 */}
          <Button
            type="button"
            variant="outline"
            onClick={onConsult}
            aria-label={t("tlNavConsult")}
            className="flex-col items-center gap-0.5 rounded-lg border-white/20 px-1 py-1 text-slate-300 hover:bg-transparent active:bg-white/10 cursor-pointer min-w-0"
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span className="text-2xs font-bold truncate max-w-full">{t("mobileNavConsult")}</span>
          </Button>
        </div>
      </nav>
    </>
  );
}

FloatingNav.displayName = "FloatingNav";
