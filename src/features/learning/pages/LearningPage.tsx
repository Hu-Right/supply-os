/**
 * 联合国采购与国际投标学习区
 * Learning Center Page
 *
 * @module features/learning/pages/LearningPage
 * @description 页头 + 资料列表 + FAQ。
 *              从数据库 API 加载资料和已购状态。
 */
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { toast } from "sonner";
import { FAQS } from "../constants";
import { MaterialCard } from "../components/MaterialCard";
import { FAQPanel } from "../components/FAQPanel";
import { useLearningMaterials, type ApiBundle } from "../hooks/useLearningMaterials";
import type { LearningMaterial } from "@/types";
import { emitAppEvent, type PayEventDetail } from "@/core/events";

export default function LearningPage() {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const { materials, bundles, purchasedIds, loading, refreshPurchased, bumpDownloadCount } = useLearningMaterials();

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
    })
      .then(() => bumpDownloadCount(materialId))
      .catch((err) => console.warn("[LearningPage] 下载追踪上报失败:", err));
  };

  const handleBuyMaterial = (material: LearningMaterial) => {
    if (!authUser) { emitAppEvent("supply-os:require-login"); return; }
    emitAppEvent("supply-os:pay", {
      code: `material_${material.id}`, name: material.titleZh, price: material.price ?? 0, currency: "CNY",
    });
  };

  const handleBuyBundle = (bundle: ApiBundle) => {
    if (!authUser) { emitAppEvent("supply-os:require-login"); return; }
    emitAppEvent("supply-os:pay", {
      code: `bundle_${bundle.id}`, name: bundle.labelZh, price: bundle.price, currency: "CNY",
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
      {/* ══ 页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          联合国采购与国际投标学习区
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-3xl">
          从入驻指南、编码匹配、合规清单到中标案例，系统掌握国际公共采购全流程知识。
        </p>
      </section>

      {/* ══ 资料列表 + FAQ ═══ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">{t("learningSectionTitle")}</h3>
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
