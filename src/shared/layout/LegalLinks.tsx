/**
 * 法律与关于链接组（页脚 / 移动端抽屉共用）
 *
 * @module shared/layout/LegalLinks
 * @description 合规布点 P0：全站页脚与移动端抽屉必须能随时进入以下声明页。
 *              链接集中在这里，避免页脚与抽屉两份清单漂移；新增/下线一条只改本文件。
 */
"use client";

import Link from "next/link";
import { useLocale } from "@/core/i18n";

export interface LegalLinkItem {
  href: string;
  labelKey: string;
  fallback: string;
}

/** 顺序 = 用户最常找的在前：协议 → 隐私 → 付费退款 → 来源 → 版权 → 投诉 → 注销 → 关于 */
export const LEGAL_LINKS: LegalLinkItem[] = [
  { href: "/terms", labelKey: "footerTerms", fallback: "服务协议" },
  { href: "/privacy", labelKey: "footerPrivacy", fallback: "隐私政策" },
  { href: "/refund-policy", labelKey: "footerPaidRights", fallback: "付费权益与退款" },
  { href: "/notice-source", labelKey: "footerNoticeSource", fallback: "标讯来源声明" },
  { href: "/copyright", labelKey: "footerCopyrightNotice", fallback: "版权与转载" },
  { href: "/complaint", labelKey: "footerComplaint", fallback: "投诉与争议" },
  { href: "/account-cancellation", labelKey: "footerAccountCancellation", fallback: "个人信息与账号" },
  { href: "/about", labelKey: "footerAbout", fallback: "关于我们" },
];

export function LegalLinks({
  className = "",
  itemClassName = "",
  onNavigate,
}: {
  className?: string;
  itemClassName?: string;
  onNavigate?: () => void;
}) {
  const { t } = useLocale();
  return (
    <nav className={className} aria-label={t("footerLegalNav") || "法律与关于"}>
      {LEGAL_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`hover:underline hover:text-slate-600 transition-colors ${itemClassName}`}
        >
          {t(item.labelKey) || item.fallback}
        </Link>
      ))}
    </nav>
  );
}
