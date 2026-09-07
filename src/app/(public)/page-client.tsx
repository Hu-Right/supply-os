"use client";

/**
 * 新首页 — 客户端薄壳
 * New Homepage — Client Shell
 *
 * @description 组合各区块组件，不包含业务逻辑。
 *              页面结构 / Page structure:
 *   1. Hero 区 — 双搜索入口（找采购机会 / 找供应商）
 *   2. 实时数字墙 — 6 个规模指标
 *   3. 热门话题 — 国家/行业/UNSPSC 快捷入口
 *   4. 全球商机地图
 *   5. 三栏内容 — 今日热门商机 / 优质供应商 / 最新 RFQ 询价
 *   6. 产品路径 — 从找标到中标 4 步
 *   7. 会员升级横幅
 */
import {
  HeroSection,
  StatsWall,
  HotTopicsSection,
  WorldMapSection,
  ContentColumns,
  ProductPath,
  UpgradeBanner,
} from "@/features/home";

export default function PageClient() {
  return (
    <div className="min-h-screen bg-slate-50">
      <HeroSection />
      <StatsWall />
      <HotTopicsSection />
      <WorldMapSection />
      <ContentColumns />
      <ProductPath />
      <UpgradeBanner />
    </div>
  );
}
