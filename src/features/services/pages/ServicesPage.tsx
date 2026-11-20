/**
 * 投标服务市场页面（模块08 设计图还原）
 * Services Page — Module 08 Design Restore
 *
 * @module features/services/pages/ServicesPage
 * @description 深色Hero + 4步生命周期步骤条 + 6张自营服务卡片 + 生态引流横幅 + 信任条。
 *              第三方服务生态已于 2026-11-20 独立为 /ecosystem 一级模块（老板决策），
 *              本页保留自营服务市场定位，尾部横幅引流生态模块。
 */

import { SERVICES } from "@/data/services";
import { useLocale } from "@/core/i18n";
import { ServicesHero } from "../components/ServicesHero";
import { ServiceCardGrid } from "../components/ServiceCardGrid";
import { EcosystemBanner } from "../components/EcosystemBanner";
import { TrustBar } from "../components/TrustBar";

export default function ServicesPage() {
  const { locale } = useLocale();
  // 服务项静态数据带中英双文案；非中文界面用英文（其余语言暂无翻译，回落到英文）
  const services = locale === "zh"
    ? SERVICES
    : SERVICES.map((item) => ({
        ...item,
        title: item.titleEn ?? item.title,
        desc: item.descEn ?? item.desc,
        specs: item.specsEn ?? item.specs,
        priceLabel: item.priceLabelEn ?? item.priceLabel,
      }));

  return (
    <div className="space-y-6">
      {/* Hero 页头 + 4步生命周期步骤条 */}
      <ServicesHero />

      {/* 6张自营服务卡片（3×2网格） */}
      <ServiceCardGrid services={services} />

      {/* 第三方服务生态引流横幅（独立模块 /ecosystem） */}
      <EcosystemBanner />

      {/* 信任条 */}
      <TrustBar />
    </div>
  );
}

ServicesPage.displayName = "ServicesPage";
