/**
 * 装饰性 Section 标题（带圆点装饰线）
 * Decorated Section Title
 *
 * @module features/training/components/SectionTitle
 * @description 落地页统一的居中标题样式，两侧带渐变线与圆点装饰。
 */

export interface SectionTitleProps {
  title: string;
  subtitle?: string;
}

export function SectionTitle({ title, subtitle }: SectionTitleProps) {
  return (
    <div className="mb-8 text-center">
      <div className="flex items-center justify-center gap-3">
        <span className="hidden h-px w-16 bg-gradient-to-r from-transparent to-teal-400 sm:block" />
        <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
        <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
        <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
        <span className="hidden h-px w-16 bg-gradient-to-l from-transparent to-teal-400 sm:block" />
      </div>
      {subtitle && <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

SectionTitle.displayName = "SectionTitle";
