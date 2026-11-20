/**
 * 第三方服务生态 — 页面主体（两个子块组合）
 * Ecosystem Page Content
 *
 * @module features/ecosystem/components/EcosystemPageContent
 * @description /ecosystem 页主体：子块A 研修培训（TrainingEcoBlock，报名制，
 *              跳转 /training 落地页）+ 子块B 入驻伙伴墙（PartnerEcosystem，
 *              咨询制，线索撮合）。标题/徽章/描述由 EcosystemHero 承载。
 */

import { TrainingEcoBlock } from "./TrainingEcoBlock";
import { PartnerEcosystem } from "./PartnerEcosystem";

export function EcosystemPageContent() {
  return (
    <div className="space-y-6">
      {/* 子块A：研修培训（在售期次橱窗 → /training 报名） */}
      <TrainingEcoBlock />

      {/* 子块B：入驻伙伴墙（featured 锚定卡 + 伙伴卡 + 入驻邀请） */}
      <PartnerEcosystem />
    </div>
  );
}

EcosystemPageContent.displayName = "EcosystemPageContent";
