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

import { usePathname, useRouter } from "next/navigation";
import { BookOpen, MessageSquare, Plus } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { Button } from "@/shared/ui";

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
};

export function SessionBanner() {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();

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
        {(pathname === "/showroom" || pathname === "/") && (
          <button
            onClick={() => emitAppEvent("supply-os:open-showroom-register")}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-transparent text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>{t("registerShowroomBtn")}</span>
          </button>
        )}
        {pathname === "/supplier" && (
          <button
            onClick={() => emitAppEvent("supply-os:open-supplier-register")}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-transparent text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">{t("registerSupplierBtn")}</span>
            <span className="md:hidden">{t("registerSupplierBtnShort")}</span>
          </button>
        )}
        {pathname === "/procurement" && (
          <button
            onClick={() => router.push("/procurement/qualification")}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer min-h-[40px]"
          >
            <BookOpen className="w-4 h-4 text-orange-100" />
            <span>{t("procurementScreeningBtn")}</span>
          </button>
        )}
        <Button
          onClick={() => emitAppEvent("supply-os:consult")}
          variant="dark"
          className="py-2 rounded-xl font-semibold shadow-xs cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-teal-400" />
          <span>{t("bookServiceNow")}</span>
        </Button>
      </div>
    </div>
  );
}

SessionBanner.displayName = "SessionBanner";
