/**
 * 应用头部（Header + 桌面导航 + 移动菜单）
 * App Header with desktop nav + mobile menu
 *
 * @module shared/layout/AppHeader
 */
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Globe, Building2, Users, Briefcase, BookOpen, Crown,
  LayoutGrid, Menu,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { preloadRoute } from "@/routes";

export interface AppTab {
  id: number;
  label: string;
  icon: typeof Globe;
  alert?: boolean;
  highlight?: boolean;
}

export interface AppHeaderProps {
  tabs: AppTab[];
  tabRoutes: Record<number, string>;
  activeTab: number;
  isTrainingRoute: boolean;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onSwitchTab: (tabId: number) => void;
  onOpenAuth: () => void;
}

export function AppHeader({
  tabs, tabRoutes, activeTab, isTrainingRoute,
  mobileMenuOpen, setMobileMenuOpen, onSwitchTab, onOpenAuth,
}: AppHeaderProps) {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const navScrollRef = useRef<HTMLDivElement>(null);

  // 鼠标在导航栏上时：滚轮纵向→横向转换
  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200/80 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
              <Globe className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-teal-700 to-slate-900 bg-clip-text text-transparent">{t("brandName")}</h1>
              <div className="text-xs text-slate-400 font-mono hidden md:block">
                SYS: ACTIVE | UTC: 2026-05-30
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={onOpenAuth}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${isVip ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"}`}>
              <Crown className="w-3.5 h-3.5" />
              <span>{authUser ? `${authUser.display_name || authUser.email} · ${isVip ? t("vipLabel") : t("freeLabel")}` : t("guestLevel")}</span>
            </button>
            <LanguageSwitcher />
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 z-30 shadow-md">
          <div className="grid grid-cols-2 gap-2 text-center">
            {tabs.slice(0, 6).map((tab) => (
              <button key={tab.id} onClick={() => { onSwitchTab(tab.id); setMobileMenuOpen(false); }}
                className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === tab.id ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DESKTOP NAV */}
      <nav className="hidden md:block bg-slate-900 text-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={navScrollRef} className="flex gap-1.5 py-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => onSwitchTab(tab.id)}
                  onMouseEnter={() => preloadRoute(tabRoutes[tab.id] || "/showroom")}
                  className={`flex shrink-0 items-center space-x-2 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${!isTrainingRoute && activeTab === tab.id ? "bg-teal-600 text-white shadow-md font-semibold" : tab.highlight ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20" : "hover:bg-slate-800 text-slate-300"}`}>
                  <Icon className={`w-4 h-4 ${tab.highlight && !isTrainingRoute && activeTab !== tab.id ? "text-amber-400 animate-pulse" : ""}`} />
                  <span>{tab.label}</span>
                  {tab.alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

/** 构建主导航 tabs 配置 */
export function useNavTabs() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();

  const isTrainingRoute = location.pathname === "/training";
  const activeTab = (() => {
    if (isTrainingRoute) return 0;
    const p = location.pathname;
    if (p === "/showroom" || p === "/") return 1;
    if (p === "/procurement") return 2;
    if (p === "/supplier") return 3;
    if (p === "/crm") return 4;
    if (p === "/services") return 5;
    if (p === "/learning") return 6;
    if (p === "/membership") return 7;
    return 1;
  })();

  const tabRoutes: Record<number, string> = { 1: "/showroom", 2: "/procurement", 3: "/supplier", 4: "/crm", 5: "/services", 6: "/learning", 7: "/membership" };

  const switchMainTab = (tabId: number) => {
    navigate(tabRoutes[tabId] || "/showroom");
  };

  const tabs: AppTab[] = [
    { id: 1, label: t("navShowrooms"), icon: Building2 },
    { id: 2, label: t("navJointProcure"), icon: Globe },
    { id: 3, label: t("navSuppliers"), icon: Users },
    { id: 4, label: t("navCRM"), icon: Briefcase, alert: true },
    { id: 5, label: t("navServices"), icon: LayoutGrid },
    { id: 6, label: t("navLearning"), icon: BookOpen },
    { id: 7, label: t("navMembership"), icon: Crown, highlight: true },
  ];

  return { tabs, tabRoutes, activeTab, isTrainingRoute, switchMainTab };
}
