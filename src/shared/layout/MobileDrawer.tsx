/**
 * 移动端抽屉菜单（DeepSeek 风格）
 * Mobile drawer menu (DeepSeek-style)
 *
 * @module shared/layout/MobileDrawer
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Globe, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { useMembershipTier } from "@/features/membership/hooks/useMembershipTier";
import { preloadRoute } from "@/routes";
import { NAV_TABS } from "./nav-tabs";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  isTrainingRoute: boolean;
}

export function MobileDrawer({ open, onClose, isTrainingRoute }: MobileDrawerProps) {
  const { t } = useLocale();
  const { authUser, isVip } = useAuth();
  const { tierLabel } = useMembershipTier();
  const navigate = useNavigate();
  const location = useLocation();

  // VIP 等级标签：按已解锁套餐显示，兜底 VIP
  const vipDisplayLabel = tierLabel || "VIP";
  const userTierLabel = tierLabel || (isVip ? t("vipLabel") : t("freeLabel"));

  if (!open) return null;

  const handleNavClick = (path: string) => {
    navigate(path);
    onClose();
  };

  const isTabActive = (path: string) => {
    const p = location.pathname;
    return p === path || (path === "/showroom" && (p === "/" || p === ""));
  };

  return (
    <div className="md:hidden fixed inset-0 z-50">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 抽屉面板 */}
      <div className="absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
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
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{vipDisplayLabel}</span>
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
                {userTierLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
