/**
 * 学习中心页面
 * Learning Center Page
 *
 * @module features/learning/pages/LearningPage
 * @description 学习中心页面入口，展示下载材料和 FAQ
 *              Learning center page entry, displays download materials and FAQ
 */

import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { TRAINING_DOWNLOAD_MATERIALS, FAQS } from "@/data";
import { MaterialCard } from "../components/MaterialCard";
import { FAQPanel } from "../components/FAQPanel";

export default function LearningPage() {
  const { t } = useLocale();
  const { isVip } = useAuth();

  const handleDownload = (fileUrl: string, fileName: string, materialId: string) => {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    fetch("/api/training/downloads/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: materialId, file_name: fileName }),
    }).catch(() => {});
  };

  const handleUpgradeClick = () => {
    window.dispatchEvent(new CustomEvent("supply-os:require-login"));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">
              {t("learningSectionTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{t("learningSectionDesc")}</p>
          </div>

          <div className="space-y-4">
            {TRAINING_DOWNLOAD_MATERIALS.map((lm) => (
              <MaterialCard
                key={lm.id}
                material={lm}
                isVip={isVip}
                onDownload={handleDownload}
                onUpgradeClick={handleUpgradeClick}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-4">
          <FAQPanel faqs={FAQS} />
        </div>
      </div>
    </div>
  );
}

LearningPage.displayName = "LearningPage";
