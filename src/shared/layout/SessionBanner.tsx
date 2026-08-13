/**
 * 会话状态页头横幅
 * Session Status Header Banner
 *
 * @module shared/layout/SessionBanner
 * @description 各主 Tab 顶部的动态摘要横幅（对齐远端 "Dynamic header summary banner"）：
 *              SESSION ACTIVE STATUS 徽标 + 按当前路由切换的标题/副标题 + 右侧动作按钮
 *              （入驻展厅 / 初筛问卷 / 注册供应商 / 返回公采，及常驻的预约顾问）。
 *              页面内注册表单通过全局事件触发，保持 feature 模块自包含。
 *              Dynamic per-route summary banner above the main workspace. Page-owned
 *              register forms are triggered via global events to keep features self-contained.
 */

import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, MessageSquare, Plus } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";

type BannerConfig = {
  /** 标题翻译键 */
  titleKey: LocaleKey;
  /** 副标题翻译键（无则不渲染） */
  descKey?: LocaleKey;
};

/** 路由 → 横幅文案配置（对齐远端各 Tab 标题/副标题） */
const BANNER_BY_PATH: Record<string, BannerConfig> = {
  "/showroom": { titleKey: "showroomTitle", descKey: "showroomSubTitle" },
  "/procurement": { titleKey: "procurementNoticePoolTitle" },
  "/supplier": { titleKey: "supplierMgmtTitle", descKey: "tabSupplierDesc" },
  "/crm": { titleKey: "crmDashboard", descKey: "tabCrmDesc" },
  "/services": { titleKey: "serviceEcoTitle", descKey: "ecosystemsSummary" },
  "/learning": { titleKey: "learningTitle", descKey: "tabLearningDesc" },
  "/training": { titleKey: "trainingBannerTitle", descKey: "trainingBannerDesc" },
};

export function SessionBanner() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const config = BANNER_BY_PATH[pathname === "/" ? "/showroom" : pathname];
  if (!config) return null;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-teal-50/20 via-white to-slate-50">
      <div>
        <span className="text-xs font-bold text-teal-600 uppercase tracking-widest px-2.5 py-1 rounded-full bg-teal-100/60 inline-block mb-2">
          SESSION ACTIVE STATUS
        </span>
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-800">{t(config.titleKey)}</h2>
        {config.descKey && (
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t(config.descKey)}</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 shrink-0 w-full md:w-auto">
        {pathname === "/training" && (
          <button
            onClick={() => navigate("/procurement")}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
            <span>{t("backToProcurement")}</span>
          </button>
        )}
        {(pathname === "/showroom" || pathname === "/") && (
          <button
            onClick={() => emitAppEvent("supply-os:open-showroom-register")}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-transparent text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t("registerShowroomBtn")}</span>
          </button>
        )}
        {pathname === "/supplier" && (
          <button
            onClick={() => emitAppEvent("supply-os:open-supplier-register")}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-transparent text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t("registerSupplierBtn")}</span>
          </button>
        )}
        {pathname === "/procurement" && (
          <button
            onClick={() => navigate("/training")}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-orange-100" />
            <span>{t("procurementScreeningBtn")}</span>
          </button>
        )}
        <button
          onClick={() => emitAppEvent("supply-os:consult")}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-teal-400" />
          <span>{t("bookServiceNow")}</span>
        </button>
      </div>
    </div>
  );
}

SessionBanner.displayName = "SessionBanner";
