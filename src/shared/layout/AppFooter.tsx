/**
 * 应用底部（桌面 Footer）
 * App Footer — desktop only
 *
 * @module shared/layout/AppFooter
 * @description 桌面端页脚：版权信息、ICP 备案、服务条款链接。
 *              移动端导航已整合至 AppHeader 顶部标签栏，此处仅保留桌面端页脚。
 *              Desktop footer: copyright, ICP filing, terms links.
 *              Mobile navigation is handled by the top tab bar in AppHeader.
 */
import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { apiCached } from "@/core/http/api-client";

export interface AppFooterProps {
  activeTab: number;
  onSwitchTab: (tabId: number) => void;
  onOpenConsult: () => void;
}

export function AppFooter({ activeTab: _a, onSwitchTab: _s, onOpenConsult: _c }: AppFooterProps) {
  const { t } = useLocale();
  const [icp, setIcp] = useState("");

  useEffect(() => {
    apiCached<{ bah: string }>("/api/system/icp", 60 * 60 * 1000)
      .then((data) => { if (data.bah) setIcp(data.bah); })
      .catch(() => undefined);
  }, []);

  return (
    <footer className="hidden md:block bg-slate-100 border-t border-slate-200 py-6 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
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
        <div className="flex space-x-4">
          <span className="hover:underline cursor-pointer">{t("footerTerms")}</span>
          <span className="hover:underline cursor-pointer">{t("footerPrivacy")}</span>
          <span className="hover:underline cursor-pointer">{t("footerUnspsc")}</span>
        </div>
      </div>
    </footer>
  );
}
