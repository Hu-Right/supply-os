/**
 * 投标服务市场页面（模块08 设计图 + 第三方服务生态改版）
 * Services Page — Module 08 Design + Eco Ecosystem Revamp
 *
 * @module features/services/pages/ServicesPage
 * @description 深色Hero + 4步生命周期步骤条 + 6张服务卡片
 *              + 第三方服务生态大分区（子块A 研修培训橱窗 / 子块B 入驻伙伴墙）+ 信任条
 */

import { SERVICES } from "@/data/services";
import { ServicesHero } from "../components/ServicesHero";
import { ServiceCardGrid } from "../components/ServiceCardGrid";
import { EcoEcosystemSection } from "../components/EcoEcosystemSection";
import { TrustBar } from "../components/TrustBar";

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      {/* Hero 页头 + 4步生命周期步骤条 */}
      <ServicesHero />

      {/* 6张服务卡片（3×2网格，平台自营） */}
      <ServiceCardGrid services={SERVICES} />

      {/* 第三方服务生态大分区：子块A 研修培训（报名制）+ 子块B 入驻伙伴墙（咨询制） */}
      <EcoEcosystemSection />

      {/* 信任条 */}
      <TrustBar />
    </div>
  );
}

ServicesPage.displayName = "ServicesPage";
