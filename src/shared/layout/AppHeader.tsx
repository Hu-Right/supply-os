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
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Globe, Crown, Menu, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NAV_TABS } from "./nav-tabs";
import { MobileDrawer } from "./MobileDrawer";

/** 格式化本地时间为 YYYY-MM-DD HH:MM:SS */
const fmtLocalTime = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' +
  String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');

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

  // 动态本地时间（每秒刷新）
  const [localTime, setLocalTime] = useState(() => fmtLocalTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setLocalTime(fmtLocalTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

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
      <header suppressHydrationWarning className="sticky top-0 z-40 bg-white/95 border-b border-secondary-200/80 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          {/* 左侧：汉堡菜单 + 品牌标识 */}
          <div className="flex items-center min-w-0 space-x-3">
            {/* 移动端汉堡菜单按钮（左侧） */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 transition-colors shrink-0"
              aria-label={mobileMenuOpen ? t("uiMenuClose") : t("uiMenuOpen")}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
              <Globe className="w-6 h-6 animate-spin-slow" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-xl font-bold tracking-tight truncate max-w-full bg-gradient-to-r from-primary-700 to-secondary-900 bg-clip-text text-transparent">{t("brandName")}</h1>
              <div className="text-xs text-secondary-400 font-mono hidden md:block">
                SYS: ACTIVE | {localTime}
              </div>
            </div>
          </div>
          {/* 右侧：用户操作区 */}
          <div className="flex items-center space-x-3 shrink-0">
            <button onClick={onOpenAuth}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${isVip ? "bg-accent-100 text-accent-800 border border-accent-300" : "bg-secondary-100 text-secondary-500 border border-secondary-200 hover:bg-secondary-200"}`}>
              <Crown className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{authUser ? `${authUser.nickname || authUser.email} · ${vipDisplayLabel}` : t("guestLevel")}</span>
              <span className="md:hidden">{authUser ? (authUser.nickname || authUser.email) : t("guestLevelShort")}</span>
            </button>
            {/* 语言切换器：移动端隐藏（抽屉菜单已提供语言选择） */}
            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>
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
      <nav className="hidden md:block bg-secondary-900 text-secondary-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={navScrollRef} className="flex gap-1.5 py-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.path;
              return (
                <Link key={tab.path} href={tab.path} scroll={false}
                  className={`flex shrink-0 items-center space-x-2 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${isActive ? "bg-primary-600 text-white shadow-md font-semibold" : tab.highlight ? "bg-accent-500/10 text-accent-400 border border-accent-500/25 hover:bg-accent-500/20" : "hover:bg-secondary-800 text-secondary-300"}`}>
                  <Icon className={`w-4 h-4 ${tab.highlight && !isActive ? "text-accent-400 animate-pulse" : ""}`} />
                  <span>{tab.label}</span>
                  {tab.alert && <span className="w-2 h-2 rounded-full bg-danger-500 animate-ping inline-block" />}
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
  const { authUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // CRM 仅登录后可见：未登录时从导航中移除（文档要求"CRM 退出公开导航"）
  const visibleTabs = NAV_TABS.filter((tab) => tab.path !== "/crm" || !!authUser);

  const tabs: AppTab[] = visibleTabs.map((tab) => ({
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
