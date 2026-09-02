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
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Globe, Crown, Menu, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NAV_TABS } from "./nav-tabs";
import { MobileDrawer } from "./MobileDrawer";

export interface AppTab {
  path: string;
  label: string;
  icon: typeof Globe;
  alert?: boolean;
  highlight?: boolean;
}

export interface AppHeaderProps {
  tabs: AppTab[];
  activeTab: string;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onSwitchTab: (path: string) => void;
  onOpenAuth: () => void;
  /** 会员等级标签（由 app 层调用 useMembershipTier 获取后传入，避免 shared→features 违规） */
  tierLabel: string;
}

export function AppHeader({
  tabs, activeTab,
  mobileMenuOpen, setMobileMenuOpen, onSwitchTab, onOpenAuth,
  tierLabel,
}: AppHeaderProps) {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const navScrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // VIP 等级标签：按已解锁套餐显示（个人版/基础版/旗舰版/至尊版），兜底 VIP
  const vipDisplayLabel = tierLabel || (isVip ? t("vipLabel") : t("freeLabel"));

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

  return (
    <>
      <header suppressHydrationWarning className="sticky top-0 z-40 bg-white/95 border-b border-slate-200/80 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
              <Globe className="w-6 h-6 animate-spin-slow" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-xl font-bold tracking-tight truncate max-w-full bg-gradient-to-r from-teal-700 to-slate-900 bg-clip-text text-transparent">{t("brandName")}</h1>
              <div className="text-xs text-slate-400 font-mono hidden md:block">
                SYS: ACTIVE | UTC: 2026-05-30
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={onOpenAuth}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${isVip ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"}`}>
              <Crown className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{authUser ? `${authUser.display_name || authUser.email} · ${vipDisplayLabel}` : t("guestLevel")}</span>
              <span className="md:hidden">{authUser ? (authUser.display_name || authUser.email) : t("guestLevelShort")}</span>
            </button>
            <LanguageSwitcher />
            {/* 移动端汉堡菜单按钮 */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label={mobileMenuOpen ? t("uiMenuClose") : t("uiMenuOpen")}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ═══ 移动端抽屉菜单（DeepSeek 风格） ══ */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        tierLabel={tierLabel}
      />

      {/* DESKTOP NAV */}
      <nav className="hidden md:block bg-slate-900 text-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={navScrollRef} className="flex gap-1.5 py-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.path;
              return (
                <Link key={tab.path} href={tab.path} scroll={false}
                  className={`flex shrink-0 items-center space-x-2 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${isActive ? "bg-teal-600 text-white shadow-md font-semibold" : tab.highlight ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20" : "hover:bg-slate-800 text-slate-300"}`}>
                  <Icon className={`w-4 h-4 ${tab.highlight && !isActive ? "text-amber-400 animate-pulse" : ""}`} />
                  <span>{tab.label}</span>
                  {tab.alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

/** 构建主导航 tabs 配置（以 NAV_TABS 为单一数据源，路径作为 Tab 标识） */
export function useNavTabs() {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const tabs: AppTab[] = NAV_TABS.map((tab) => ({
    path: tab.path,
    label: t(tab.labelKey),
    icon: tab.icon,
    alert: tab.alert,
    highlight: tab.highlight,
  }));

  // 当前路由匹配对应 Tab（支持子路由前缀匹配，如 /membership/xxx）
  const activeTab = (() => {
    const p = pathname;
    const hit = NAV_TABS.find((tab) => p === tab.path || p.startsWith(`${tab.path}/`));
    if (hit) return hit.path;
    return "/showroom";
  })();

  const switchMainTab = (path: string) => {
    router.push(path);
  };

  return { tabs, activeTab, switchMainTab };
}
