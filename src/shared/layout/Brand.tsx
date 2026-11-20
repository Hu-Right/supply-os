/**
 * 品牌标识（图标 + 字标）
 * Brand lockup: icon + wordmark
 *
 * @module shared/layout/Brand
 * @description 中英文站点共用的品牌锁定组合，统一图标尺寸、字标字号与颜色，
 *              避免各外壳各写一份导致品牌表达漂移。
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

export interface BrandProps {
  /** 品牌字标（zh: 云境·国际采购平台 / en: Yunjing · International Procurement Platform） */
  name: string;
  /** 首页链接；传 null 时渲染为非链接 */
  href?: string | null;
  /** 尺寸档位 */
  size?: "sm" | "md";
  /** 副标题（如 SYS 时钟、英文站副描述） */
  subtitle?: ReactNode;
  /** 副标题附加类名（如移动端隐藏） */
  subtitleClassName?: string;
  className?: string;
}

export function Brand({ name, href = "/", size = "md", subtitle, subtitleClassName, className }: BrandProps) {
  const iconCls = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const wordCls = size === "sm" ? "text-base" : "text-lg md:text-xl";

  const content = (
    <>
      <img
        src="/images/brand-icon.svg"
        alt=""
        aria-hidden="true"
        className={cn("shrink-0 object-contain", iconCls)}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-bold tracking-tight text-brand-900", wordCls)}>
          {name}
        </span>
        {subtitle ? (
          <span className={cn("mt-0.5 block truncate text-xs text-secondary-400", subtitleClassName)}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!href) {
    return <div className={cn("flex min-w-0 items-center gap-3", className)}>{content}</div>;
  }

  return (
    <Link href={href} className={cn("flex min-w-0 items-center gap-3", className)} aria-label={name}>
      {content}
    </Link>
  );
}

Brand.displayName = "Brand";
