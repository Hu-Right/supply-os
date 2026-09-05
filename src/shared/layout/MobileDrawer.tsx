/**
 * 移动端抽屉菜单（DeepSeek 风格）
 * Mobile drawer menu (DeepSeek-style)
 *
 * @module shared/layout/MobileDrawer
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, X, Check, Loader2 } from "lucide-react";
import { useLocale, SUPPORTED_LOCALES } from "@/core/i18n";
import type { Locale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { NAV_TABS } from "./nav-tabs";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 会员等级标签（由 AppHeader 从 app 层透传，避免 shared→features 违规） */
  tierLabel: string;
}

export function MobileDrawer({ open, onClose, tierLabel }: MobileDrawerProps) {
  const { t, locale, switching, setLocale } = useLocale();
  const { authUser, isVip } = useAuth();
  const pathname = usePathname();

  // VIP 等级标签：按已解锁套餐显示，兜底 i18n VIP/免费标签
  const vipDisplayLabel = tierLabel || (isVip ? t("vipLabel") : t("freeLabel"));
  const userTierLabel = vipDisplayLabel;

  if (!open) return null;

  const isTabActive = (path: string) => {
    const p = pathname;
    return p === path || (path === "/showroom" && (p === "/" || p === ""));
  };

  const handleLocaleSelect = (code: Locale) => {
    if (switching) return;
    setLocale(code);
  };

  return (
    <div className="md:hidden fixed inset-0 z-50">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 抽屉面板 */}
      <div className="absolute top-0 left-0 bottom-0 min-w-[260px] max-w-[85vw] sm:w-72 bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        {/* 抽屉头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white">
              <Globe className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-800">{t("brandName")}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 导航项列表 — CRM 仅登录后可见 */}
        <nav className="flex-1 overflow-y-auto py-2 px-3">
          {NAV_TABS.filter((tab) => tab.path !== "/crm" || !!authUser).map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.path);
            const label = t(tab.labelKey);
            return (
              <Link
                key={tab.path}
                href={tab.path}
                onClick={onClose}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] mb-0.5 ${
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
                  <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{vipDisplayLabel}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* 语言选择区 */}
        <div className="border-t border-slate-100 px-3 py-2">
          <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-slate-400">
            {t("uiSelectLanguage")}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {SUPPORTED_LOCALES.map((l) => {
              const selected = l.code === locale;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => handleLocaleSelect(l.code)}
                  disabled={switching}
                  dir={l.dir}
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    switching
                      ? "opacity-50 cursor-wait"
                      : ""
                  } ${
                    selected
                      ? "bg-teal-50 text-teal-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {selected && switching ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : selected ? (
                    <Check className="w-3 h-3 text-teal-600" />
                  ) : null}
                  <span>{l.nativeName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 抽屉底部：用户信息 */}
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-bold">
              {authUser ? (authUser.nickname || authUser.email).charAt(0).toUpperCase() : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {authUser ? authUser.nickname || authUser.email : t("guestLevelShort")}
              </p>
              <p className={`text-xs ${isVip ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                {userTierLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
