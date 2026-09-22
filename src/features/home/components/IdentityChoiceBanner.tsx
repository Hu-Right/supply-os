/**
 * 首页身份选择引导横幅
 * Identity Choice Banner for Homepage
 *
 * @module features/home/components/IdentityChoiceBanner
 * @description 登录用户尚未完善企业信息与供应商资源库时，在首页显示引导横幅，
 *              提供两个快捷入口。V2/ADR-0004：两种身份不再互斥，可任选其一或都完善。
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Package, ArrowRight, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import { useHasSupplierPool } from "@/shared/hooks/useHasSupplierPool";

export function IdentityChoiceBanner() {
  const { t } = useLocale();
  const userId = useUserId();
  const router = useRouter();
  const { bound, loading: entLoading } = useEnterpriseInfo();
  const { hasPool, loading: poolLoading } = useHasSupplierPool(userId);

  const [dismissed, setDismissed] = useState(false);

  // 未登录、已选择身份、或已关闭 → 不显示
  if (!userId || entLoading || poolLoading || bound || hasPool || dismissed) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <div className="relative rounded-2xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 p-1 rounded-lg text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
        {/* 标题行 */}
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-extrabold text-blue-900">
            {t("settingsIdentityChoice") || "请选择您的身份"}
          </h3>
        </div>

        {/* 两个选项卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {/* 企业用户 */}
          <button
            type="button"
            onClick={() => router.push("/settings/enterprise")}
            className="group rounded-xl border border-blue-200 bg-white p-4 text-left hover:border-blue-400 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-slate-800">
                {t("settingsIdentityEnterprise") || "企业用户"}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-4 mb-2">
              {t("identityChoiceEnterpriseDesc") || "我有自己的工厂/公司，评估我的企业是否适合投标国际采购标的"}
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 group-hover:text-blue-800">
              {t("identityChoiceGoSetup") || "去设置"} <ArrowRight className="w-3 h-3" />
            </span>
          </button>

          {/* 外贸员 */}
          <button
            type="button"
            onClick={() => router.push("/settings/supplier-pool")}
            className="group rounded-xl border border-indigo-200 bg-white p-4 text-left hover:border-indigo-400 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-indigo-600" />
              <span className="text-sm font-bold text-slate-800">
                {t("settingsIdentityAgent") || "外贸员"}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-4 mb-2">
              {t("identityChoiceAgentDesc") || "我代理多家工厂，帮他们匹配国际采购机会并推荐最合适的供应商"}
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:text-indigo-800">
              {t("identityChoiceGoSetup") || "去设置"} <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
