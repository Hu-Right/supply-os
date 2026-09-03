/**
 * 学习中心页面
 * Learning Center Page
 *
 * @module features/learning/pages/LearningPage
 * @description 学习中心页面入口，从数据库 API 加载资料和已购状态
 *              Learning center page entry, loads materials and purchase status from API
 */

import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { toast } from "sonner";
import { FAQS } from "@/data";
import { MaterialCard } from "../components/MaterialCard";
import { FAQPanel } from "../components/FAQPanel";
import { useLearningMaterials, type ApiBundle } from "../hooks/useLearningMaterials";
import type { LearningMaterial } from "@/types";
import { emitAppEvent, type PayEventDetail } from "@/core/events";

export default function LearningPage() {
  const { t, locale } = useLocale();
  const { authUser } = useAuth();
  const { materials, bundles, purchasedIds, loading, refreshPurchased } = useLearningMaterials();

  // premium 资料的 fileUrl 不随列表下发（审查 F4）：为空时按需向
  // /content 端点获取（服务端校验登录 + 购买记录）
  const handleDownload = async (fileUrl: string, fileName: string, materialId: string) => {
    let url = fileUrl;
    let name = fileName;
    if (!url) {
      try {
        const data = await api<{ fileUrl: string; fileName: string }>(
          `/api/learning/materials/${encodeURIComponent(materialId)}/content`,
        );
        url = data.fileUrl;
        name = data.fileName || name;
      } catch {
        // 付费资料获取失败必须可见（E2）：此前仅 console 静默，用户无感知
        console.error("[learning] 获取下载地址失败");
        toast.error("获取下载地址失败，请稍后重试或联系客服");
        return;
      }
    }
    if (!url) {
      toast.error("该资料暂无可下载文件，请稍后重试或联系客服");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    void api("/api/training/downloads/track", {
      method: "POST",
      body: { material_id: materialId, file_name: name },
    }).catch(() => {});
  };

  const handleBuyMaterial = (material: LearningMaterial) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    emitAppEvent("supply-os:pay", {
      code: `material_${material.id}`,
      name: material.titleZh,
      price: material.price ?? 0,
      currency: "CNY",
    });
  };

  const handleBuyBundle = (bundle: ApiBundle) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    emitAppEvent("supply-os:pay", {
      code: `bundle_${bundle.id}`,
      name: bundle.labelZh,
      price: bundle.price,
      currency: "CNY",
    } as PayEventDetail);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">
              {t("learningSectionTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{t("learningSectionDesc")}</p>
          </div>

          <div className="space-y-4">
            {materials.map((lm) => (
              <MaterialCard
                key={lm.id}
                material={lm}
                isPurchased={purchasedIds.has(lm.id)}
                onDownload={handleDownload}
                onBuyMaterial={handleBuyMaterial}
              />
            ))}
          </div>

          {/* 打包购买区域 */}
          {bundles.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-4">
              <h4 className="text-sm font-extrabold text-teal-800 mb-3">{t("learningBundleTitle")}</h4>
              <div className="space-y-2">
                {bundles.map((bundle) => (
                  <Button
                    key={bundle.id}
                    onClick={() => handleBuyBundle(bundle)}
                    variant="outline"
                    className="w-full justify-between rounded-lg border-teal-200 bg-white px-4 py-3 text-sm font-normal hover:border-teal-400 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                  >
                    <span className="font-bold text-slate-800">{bundle.labelZh}</span>
                    <span className="shrink-0 ml-3 rounded-full bg-teal-600 px-3 py-1 text-xs font-black text-white">
                      ¥{bundle.price.toFixed(1)}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 lg:col-span-4">
          <FAQPanel faqs={FAQS} />
        </div>
      </div>
    </div>
  );
}

LearningPage.displayName = "LearningPage";
