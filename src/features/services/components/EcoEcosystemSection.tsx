/**
 * 第三方服务生态大分区（统辖两个子块）
 * Eco Ecosystem Section
 *
 * @module features/services/components/EcoEcosystemSection
 * @description /services 页大分区壳：分区标题 + 描述，内含
 *              子块A 研修培训（TrainingEcoBlock，报名制，跳转 /training）+
 *              子块B 入驻伙伴墙（PartnerEcosystem，咨询制，线索撮合）。
 *              锚点 #ecosystem 支持站外分享直跳。
 */

import { useLocale } from "@/core/i18n";
import { TrainingEcoBlock } from "./TrainingEcoBlock";
import { PartnerEcosystem } from "./PartnerEcosystem";

export function EcoEcosystemSection() {
  const { t } = useLocale();
  return (
    <section id="ecosystem" className="space-y-6 scroll-mt-20">
      {/* 分区标题 */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl font-extrabold text-slate-900">{t("svcEcoTitle")}</h2>
          <span className="px-2 py-0.5 rounded-full bg-teal-600/10 text-teal-700 text-xs font-bold">
            {t("svcEcoBadge")}
          </span>
        </div>
        <p className="mt-1 text-xs md:text-sm text-slate-500 max-w-2xl">
          {t("svcEcoDesc")}
        </p>
      </div>

      {/* 子块A：研修培训（在售期次橱窗 → /training 报名） */}
      <TrainingEcoBlock />

      {/* 子块B：入驻伙伴墙（featured 锚定卡 + 伙伴卡 + 入驻邀请） */}
      <PartnerEcosystem />
    </section>
  );
}

EcoEcosystemSection.displayName = "EcoEcosystemSection";
