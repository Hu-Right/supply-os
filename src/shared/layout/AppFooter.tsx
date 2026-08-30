/**
 * 应用底部（桌面 Footer）
 * App Footer — desktop only
 *
 * @module shared/layout/AppFooter
 * @description 桌面端页脚：版权信息、ICP 备案、服务条款链接、底部社交媒体链接（iconfont 字体图标）。
 *              移动端导航已整合至 AppHeader 顶部标签栏，此处仅保留桌面端页脚。
 *              Desktop footer: copyright, ICP filing, terms links, social media links (iconfont).
 *              Mobile navigation is handled by the top tab bar in AppHeader.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/core/i18n";
import { apiCached } from "@/core/http/api-client";

/** crm.link 表返回的链接数据结构 */
interface FooterLink {
  id: number;
  name: string;
  url: string;
  icon: string;
}

export interface AppFooterProps {
  activeTab: string;
  onSwitchTab: (path: string) => void;
  onOpenConsult: () => void;
}

export function AppFooter({ activeTab: _a, onSwitchTab: _s, onOpenConsult: _c }: AppFooterProps) {
  const { t } = useLocale();
  const [icp, setIcp] = useState("");
  const [links, setLinks] = useState<FooterLink[]>([]);

  useEffect(() => {
    apiCached<{ bah: string }>("/api/system/icp", 60 * 60 * 1000)
      .then((data) => { if (data.bah) setIcp(data.bah); })
      .catch(() => undefined);
    apiCached<FooterLink[]>("/api/system/links", 30 * 60 * 1000)
      .then((data) => { if (Array.isArray(data)) setLinks(data); })
      .catch(() => undefined);
  }, []);

  return (
    <footer className="hidden md:block bg-slate-100 border-t border-slate-200 py-6 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        {/* 左侧：版权信息 + ICP 备案 */}
        <p className="flex items-center gap-2">
          <span>{t("footerCopyright")}</span>
          {icp && (
            <>
              <span className="text-slate-300">|</span>
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:underline hover:text-slate-500 transition-colors">
                {icp}
              </a>
            </>
          )}
        </p>

        {/* 中间：社交媒体图标 */}
        {links.length > 0 && (
          <div className="flex items-center gap-4">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-teal-600 transition-colors"
                aria-label={link.name}
              >
                <i className={`iconfont icon-${link.icon} text-lg`} />
              </a>
            ))}
          </div>
        )}

        {/* 右侧：服务条款链接 */}
        <div className="flex space-x-4">
          <Link href="/terms" className="hover:underline cursor-pointer" target="_blank">
            {t("footerTerms")}
          </Link>
          <Link href="/privacy" className="hover:underline cursor-pointer" target="_blank">
            {t("footerPrivacy")}
          </Link>
          <span className="hover:underline cursor-pointer">{t("footerUnspsc")}</span>
        </div>
      </div>
    </footer>
  );
}
