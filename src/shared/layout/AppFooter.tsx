/**
 * 应用底部（桌面 Footer + 移动底部导航）
 * App Footer with desktop footer + mobile bottom nav
 *
 * @module shared/layout/AppFooter
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { apiCached } from "@/core/http/api-client";
import { NAV_TABS } from "./nav-tabs";

export interface AppFooterProps {
  activeTab: number;
  onSwitchTab: (tabId: number) => void;
  onOpenConsult: () => void;
}

export function AppFooter({ activeTab: _activeTab, onSwitchTab: _onSwitchTab, onOpenConsult }: AppFooterProps) {
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [icp, setIcp] = useState("");

  useEffect(() => {
    apiCached<{ bah: string }>("/api/system/icp", 60 * 60 * 1000)
      .then((data) => { if (data.bah) setIcp(data.bah); })
      .catch(() => undefined);
  }, []);

  // P0-4 修复：底部导航消费 NAV_TABS 配置，消除硬编码，确保与桌面端功能一致
  const mobileTabs = NAV_TABS.filter((tab) => tab.mobile);

  return (
    <>
      {/* CONSULT FAB */}
      <div className="md:hidden fixed bottom-18 end-4 z-50">
        <button onClick={onOpenConsult}
          className="w-12 h-12 bg-gradient-to-tr from-teal-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

      {/* MOBILE BOTTOM NAV — 3x2 网格容纳 6 个 Tab */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 shadow-lg py-1 px-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-0.5">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;
            const label = t(tab.shortLabelKey || tab.labelKey);
            return (
              <button key={tab.path} onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center justify-center py-1 text-[10px] font-semibold ${isActive ? "text-teal-600 font-bold" : "text-slate-400"}`}>
                <Icon className="w-5 h-5 mb-0.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </footer>

      {/* DESKTOP FOOTER */}
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
    </>
  );
}
