/**
 * 投标服务市场页面（模块08 设计图100%还原）
 * Services Page — Module 08 Design Mockup 100% Restore
 *
 * @module features/services/pages/ServicesPage
 * @description 按设计图还原：深色Hero + 4步生命周期步骤条 + 6张服务卡片 + 信任条 + 核心内容模块 + 变现动作 + 价值卡片 + 底部标语
 */

import { SERVICES } from "@/data/services";
import { ServicesHero } from "../components/ServicesHero";
import { ServiceCardGrid } from "../components/ServiceCardGrid";
import { TrustBar } from "../components/TrustBar";

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      {/* Hero 页头 + 4步生命周期步骤条 */}
      <ServicesHero />

      {/* 6张服务卡片（3×2网格） */}
      <ServiceCardGrid services={SERVICES} />

      {/* 信任条 */}
      <TrustBar />
    </div>
  );
}

ServicesPage.displayName = "ServicesPage";
