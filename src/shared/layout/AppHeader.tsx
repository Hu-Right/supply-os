/**
 * 应用头部（Header + 桌面导航 + 移动端抽屉菜单）
 * App Header with desktop nav + mobile drawer menu
 *
 * @module shared/layout/AppHeader
 * @description 品牌标识 + 用户操作区 + 桌面端深色导航条 + 移动端汉堡菜单抽屉。
 *              移动端参考 DeepSeek 交互：点击汉堡图标从左侧滑出全屏抽屉菜单，
 *              展示所有导航项（图标 + 标签），点击后自动关闭。
 *              Brand + user actions + desktop dark nav bar + mobile hamburger drawer.
 *              Mobile: DeepSeek-style slide-out drawer from the left with icon + label
 *              navigation items; auto-closes on selection.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Globe, Building2, Users, Briefcase, BookOpen, Crown,
  LayoutGrid, Menu, X,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { preloadRoute } from "@/routes";
import { NAV_TABS } from "./nav-tabs";

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
  const drawerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

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

  // 抽屉打开时锁定背景滚动
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);

  // ESC 关闭抽屉
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const isTabActive = (path: string) => {
    const p = location.pathname;
    return p === path || (path === "/showroom" && (p === "/" || p === ""));
  };

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
            {/* 移动端汉堡菜单按钮 */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label={mobileMenuOpen ? "关闭菜单" : "打开菜单"}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ═══ 移动端抽屉菜单（DeepSeek 风格） ══ */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* 遮罩层 */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* 抽屉面板 */}
          <div
            ref={drawerRef}
            className="absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-200"
          >
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white">
                  <Globe className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-800">{t("brandName")}</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 导航项列表 */}
            <nav className="flex-1 overflow-y-auto py-2 px-3">
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = !isTrainingRoute && isTabActive(tab.path);
                const label = t(tab.labelKey);
                return (
                  <button
                    key={tab.path}
                    onClick={() => handleNavClick(tab.path)}
                    onMouseEnter={() => preloadRoute(tab.path)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors mb-0.5 ${
                      isActive
                        ? "bg-teal-50 text-teal-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${
                      isActive ? "text-teal-600" : "text-slate-400"
                    }`} />
                    <span className="flex-1 text-start">{label}</span>
                    {tab.alert && !isActive && (
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                    )}
                    {tab.highlight && !isActive && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">VIP</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* 抽屉底部：用户信息 */}
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-bold">
                  {authUser ? (authUser.display_name || authUser.email).charAt(0).toUpperCase() : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {authUser ? authUser.display_name || authUser.email : t("guestLevel")}
                  </p>
                  <p className={`text-xs ${isVip ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                    {isVip ? t("vipLabel") : t("freeLabel")}
                  </p>
                </div>
              </div>
            </div>
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
