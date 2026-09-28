/**
 * 投标服务市场页面（模块08 设计图100%还原）
 * Services Page — Module 08 Design Mockup 100% Restore
 *
 * @module features/services/pages/ServicesPage
 * @description 按设计图还原：深色Hero + 4步生命周期步骤条 + 6张服务卡片 + 第三方服务生态 + 信任条
 */

import { SERVICES } from "@/data/services";
import { ServicesHero } from "../components/ServicesHero";
import { ServiceCardGrid } from "../components/ServiceCardGrid";
import { PartnerEcosystem } from "../components/PartnerEcosystem";
import { TrustBar } from "../components/TrustBar";

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      {/* Hero 页头 + 4步生命周期步骤条 */}
      <ServicesHero />

      {/* 6张服务卡片（3×2网格） */}
      <ServiceCardGrid services={SERVICES} />

      {/* 第三方服务生态（邀约入驻伙伴：合规/履约/售后/本地化运营） */}
      <PartnerEcosystem />

      {/* 信任条 */}
      <TrustBar />
    </div>
  );
}

ServicesPage.displayName = "ServicesPage";
