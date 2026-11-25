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
import { Globe, Crown, Menu, X, ChevronDown, LogOut } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationBell } from "./NotificationBell";
import { NAV_TABS } from "./nav-tabs";
import { MobileDrawer } from "./MobileDrawer";
import { Brand } from "./Brand";

/**
 * 路由 → 一级 Tab 的显式归属覆盖：只用于「URL 归属与信息架构不一致」的个别页面。
 * 能力诊断属于投标服务，但路由沿用 /procurement/diagnosis（商机池卡片入口仍是这里），
 * 仅靠前缀匹配会把导航高亮打到「全球商机」上。
 */
const TAB_OVERRIDES: Record<string, string> = {
  "/procurement/diagnosis": "/services",
};

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
  /** 账户入口：已登录跳 /settings/profile，未登录开登录弹窗 */
  onOpenAccount: () => void;
  /** 会员等级标签（由 app 层调用 useMembershipTier 获取后传入，避免 shared→features 违规） */
  tierLabel: string;
}

export function AppHeader({
  tabs, activeTab,
  mobileMenuOpen, setMobileMenuOpen, onOpenAccount,
  tierLabel,
}: AppHeaderProps) {
  const { t } = useLocale();
  const { authUser, isVip, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navScrollRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // 路由变化/点击外部关闭账户菜单
  useEffect(() => { setAccountMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [accountMenuOpen]);

  // 动态本地时间（每秒刷新）
  // ★ 初始化为空字符串 + suppressHydrationWarning，彻底避免 SSR/CSR 时间戳不一致导致 hydration mismatch
  const [localTime, setLocalTime] = useState("");
  useEffect(() => {
    setLocalTime(fmtLocalTime(new Date()));
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
      <header suppressHydrationWarning className="print:hidden sticky top-0 z-40 bg-white/95 border-b border-secondary-200/80 shadow-xs backdrop-blur-md">
        <div className="px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
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
            <Brand
              name={t("brandName")}
              subtitle={localTime ? `SYS: ACTIVE | ${localTime}` : null}
              subtitleClassName="hidden md:block"
            />
          </div>
          {/* 右侧：用户操作区 */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* 通知铃铛（仅登录可见，组件内部判空） */}
            <NotificationBell />
            <div className="relative" ref={accountMenuRef}>
              <button
                onClick={() => (authUser ? setAccountMenuOpen((v) => !v) : onOpenAccount())}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${isVip ? "bg-accent-100 text-accent-800 border border-accent-300" : "bg-secondary-100 text-secondary-500 border border-secondary-200 hover:bg-secondary-200"}`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{authUser ? `${authUser.nickname || authUser.email} · ${vipDisplayLabel}` : t("guestLevel")}</span>
                <span className="md:hidden">{authUser ? (authUser.nickname || authUser.email) : t("guestLevelShort")}</span>
                {authUser && <ChevronDown className={`w-3 h-3 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />}
              </button>
              {authUser && accountMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-secondary-200 bg-white py-1.5 shadow-xl">
                  <Link href="/settings" className="block px-4 py-2 text-xs font-semibold text-secondary-700 hover:bg-secondary-50">{t("settingsTitle")}</Link>
                  <Link href="/settings/profile" className="block px-4 py-2 text-xs font-semibold text-secondary-700 hover:bg-secondary-50">{t("settingsProfile")}</Link>
                  <Link href="/settings/notifications" className="block px-4 py-2 text-xs font-semibold text-secondary-700 hover:bg-secondary-50">{t("settingsNotifications")}</Link>
                  <Link href="/settings/billing" className="block px-4 py-2 text-xs font-semibold text-secondary-700 hover:bg-secondary-50">{t("billingCenterTitle")}</Link>
                  <div className="my-1 border-t border-secondary-100" />
                  <button
                    type="button"
                    onClick={async () => { setAccountMenuOpen(false); await logout(); router.push("/"); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-danger-600 hover:bg-danger-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />{t("authLogout")}
                  </button>
                </div>
              )}
            </div>
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
      <nav className="print:hidden hidden md:block bg-[#0c1929] text-secondary-200 relative overflow-hidden">
        {/* 地球装饰背景图 */}
        <img
          src="/earth.png?v=2"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-[5%] top-1/2 -translate-y-1/2 h-[160%] w-auto object-contain opacity-20"
          style={{
            maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, black 60%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, black 60%)",
          }}
        />
        <div className="px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex items-center justify-between py-2">
            {/* 左侧：导航 Tabs */}
            <div ref={navScrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-none">
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
            {/* 右侧：会员套餐按钮 */}
            <Link
              href="/membership"
              className="shrink-0 flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold border-2 border-amber-500 bg-slate-900/80 text-amber-400 hover:bg-slate-800 transition-colors ms-3 backdrop-blur-sm"
            >
              <Crown className="w-4 h-4" />
              {t("navMembership")}
            </Link>
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

  // 当前路由匹配对应 Tab（支持子路由前缀匹配，如 /procurement/notice/xxx）
  const activeTab = (() => {
    const p = pathname;
    const overridden = TAB_OVERRIDES[p];
    if (overridden) return overridden;
    const hit = NAV_TABS.find((tab) => p === tab.path || p.startsWith(`${tab.path}/`));
    return hit ? hit.path : "";
  })();

  const switchMainTab = (path: string) => {
    router.push(path);
  };

  return { tabs, activeTab, switchMainTab };
}


