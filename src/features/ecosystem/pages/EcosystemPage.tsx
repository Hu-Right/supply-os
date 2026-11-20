/**
 * 第三方服务生态页面（独立一级模块 /ecosystem）
 * Ecosystem Page
 *
 * @module features/ecosystem/pages/EcosystemPage
 * @description 2026-11-20 老板决策：第三方服务独立成模块（原 /services 页内分区升级）。
 *              页头 Hero + 子块A 研修培训（报名制）+ 子块B 入驻伙伴墙（咨询制）。
 *              版块为华测（合规准入，已签约待方案）与后续物流等实体伙伴而设；
 *              伙伴数据 GET /api/eco-partners（eco_partner 表，迁移 062，无种子）。
 */

import { EcosystemHero } from "../components/EcosystemHero";
import { EcosystemPageContent } from "../components/EcosystemPageContent";

export default function EcosystemPage() {
  return (
    <div className="space-y-6">
      {/* 页头：标题 + 邀约入驻徽章 + 描述 */}
      <EcosystemHero />

      {/* 主体：研修培训橱窗 + 入驻伙伴墙 */}
      <EcosystemPageContent />
    </div>
  );
}

EcosystemPage.displayName = "EcosystemPage";
