/**
 * 学习中心页面
 * Learning Center Page
 *
 * @module features/learning/pages/LearningPage
 * @description 学习中心页面入口，展示下载材料和 FAQ
 *              Learning center page entry, displays download materials and FAQ
 */

import { useLocale } from "@/core/i18n";
import { TRAINING_DOWNLOAD_MATERIALS, FAQS } from "@/data";
import { MaterialCard } from "../components/MaterialCard";
import { FAQPanel } from "../components/FAQPanel";

export interface LearningPageProps {
  isVip: boolean;
  onDownload: (fileUrl: string, fileName: string, materialId: string) => void;
  onUpgradeClick: () => void;
}

export default function LearningPage({ isVip, onDownload, onUpgradeClick }: LearningPageProps) {
  const { t } = useLocale();

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
                onDownload={onDownload}
                onUpgradeClick={onUpgradeClick}
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
