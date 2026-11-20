/**
 * 深色 Hero 面板（营销/模块页共用）
 * Dark hero panel shared by marketing/module pages
 *
 * @module shared/ui/HeroPanel
 * @description 统一深藏青渐变、右侧装饰圆环与标题/徽章/描述排版，
 *              避免 ServicesHero / EcosystemHero 各写一份渐变与装饰。
 */
import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

export interface HeroPanelProps {
  title: ReactNode;
  /** 标题旁的徽章（如「即将上线」「独立模块」） */
  badge?: ReactNode;
  description?: ReactNode;
  /** 标题/描述下方的补充内容（步骤条等） */
  children?: ReactNode;
  className?: string;
}

export function HeroPanel({ title, badge, description, children, className }: HeroPanelProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0d2847] px-6 py-10 sm:px-8 md:py-14",
        className,
      )}
    >
      {/* 右侧装饰圆环 */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-[40%] opacity-20" aria-hidden="true">
        <div className="absolute right-[-10%] top-[-20%] h-[140%] w-[80%] rounded-full border border-primary-500/20" />
        <div className="absolute right-[-5%] top-[-10%] h-[120%] w-[60%] rounded-full border border-primary-400/10" />
        <div className="absolute right-[5%] top-[10%] h-[80%] w-[40%] rounded-full bg-gradient-to-br from-primary-500/10 to-transparent" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-white md:text-3xl lg:text-4xl">
            {title}
          </h1>
          {badge ? (
            <span className="rounded-full border border-primary-400/30 bg-primary-600/20 px-2.5 py-1 text-xs font-bold text-primary-200">
              {badge}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary-400 md:text-base">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-8 md:mt-10">{children}</div> : null}
      </div>
    </section>
  );
}

HeroPanel.displayName = "HeroPanel";
