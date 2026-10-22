/**
 * awardViewModel 单测：验证中标情报页"真实数据派生 + 诚实空态"，杜绝硬编码假数。
 * @module tests/unit/features/procurement/awards/awardViewModel
 */
import { describe, it, expect } from "vitest";
import { buildAwardViewModel } from "@/features/procurement/awards/awardViewModel";
import type { AwardsData } from "@/features/procurement/hooks/useAwardsData";

/** 空态：无真实数据 */
const emptyData = (): AwardsData => ({
  stats: null,
  topWinners: [],
  recentAwards: [],
  hasRealData: false,
  loading: false,
  error: false,
});

/** 现状真实形制：单来源 ccgp、无金额、无品类、月份集中在近年 */
const ccgpData = (): AwardsData => ({
  hasRealData: true,
  loading: false,
  error: false,
  topWinners: [
    { name: "某某科技有限公司", country: "中国", count: 7, total_usd: 0 },
    { name: "某某贸易公司", country: "中国", count: 3, total_usd: 0 },
  ],
  recentAwards: [
    {
      id: 1669,
      title: "某采购项目中标公告",
      title_cn: "某采购项目中标公告",
      reference: null,
      agency: "中国政府采购网",
      country: "中国",
      award_date: null,
      contract_value_usd: null,
      currency: "CNY",
      category: null,
      source_platform: "ccgp",
    },
  ],
  stats: {
    total: 1669,
    total_value_usd: 0,
    by_agency: [{ agency: "中国政府采购网", count: 1669, total_usd: 0 }],
    by_country: [{ country: "中国", count: 1669 }],
    by_month: [
      { month: "2026-10", count: 46, total_usd: 0 },
      { month: "2026-09", count: 1600, total_usd: 0 },
      { month: "2026-08", count: 21, total_usd: 0 },
    ],
    top_winners: [],
  },
});

describe("buildAwardViewModel · 诚实化", () => {
  it("无真实数据：statsCards/infoCards 为空，各 section present=false 且带 reason，覆盖计数为 0", () => {
    const vm = buildAwardViewModel(emptyData());
    expect(vm.statsCards).toEqual([]);
    expect(vm.infoCards).toEqual([]);
    expect(vm.trend.present).toBe(false);
    if (!vm.trend.present) expect(vm.trend.reason).toBeTruthy();
    expect(vm.coverage.recordCount).toBe(0);
    expect(vm.coverage.sources).toEqual([]);
    expect(vm.topWinners.present).toBe(false);
  });

  it("ccgp 现状：金额不可用 → trend.amountsUsd 为 null，金额卡显示『未公开』", () => {
    const vm = buildAwardViewModel(ccgpData());
    expect(vm.coverage.amountAvailable).toBe(false);
    if (vm.trend.present) expect(vm.trend.data.amountsUsd).toBeNull();
    const amountCard = vm.infoCards.find((c) => c.title === "金额");
    expect(amountCard?.value).toBe("未公开");
  });

  it("topWinners 真实：按中标次数降序排 rank，展示真实中标商", () => {
    const vm = buildAwardViewModel(ccgpData());
    expect(vm.topWinners.present).toBe(true);
    if (vm.topWinners.present) {
      expect(vm.topWinners.data[0].name).toBe("某某科技有限公司");
      expect(vm.topWinners.data[0].rank).toBe(1);
      expect(vm.topWinners.data[0].count).toBe(7);
    }
  });

  it("buyerProfile/品类无货时诚实空态（S0 不臆造机构画像与品类分布）", () => {
    const vm = buildAwardViewModel(ccgpData());
    expect(vm.buyerProfile.present).toBe(false);
    expect(vm.categories.present).toBe(false);
  });

  it("覆盖度：sources/countries/最早年来自真实 stats + recentAwards", () => {
    const vm = buildAwardViewModel(ccgpData());
    expect(vm.coverage.sources).toEqual(["ccgp"]);
    expect(vm.coverage.countries).toEqual(["中国"]);
    expect(vm.coverage.earliestYear).toBe("2026");
    expect(vm.coverage.latestYear).toBe("2026");
  });

  it("全模型不出现任何 curated 假数（12,847 / 22.7B / 193 / Siemens）", () => {
    const vm = buildAwardViewModel(ccgpData());
    const all = JSON.stringify(vm);
    expect(all).not.toMatch(/12,?847/);
    expect(all).not.toMatch(/22\.7B/);
    expect(all).not.toMatch(/Siemens|McKesson|Cardinal Health|Medtronic/);
    expect(all).not.toMatch(/联合国儿童基金会|UNICEF/);
  });
});

describe("buildAwardViewModel · 三态透传（loading/error 供页面分支）", () => {
  it("透传 loading：加载中数据 → vm.loading=true，且不当作错误", () => {
    const vm = buildAwardViewModel({ ...emptyData(), loading: true, error: false });
    expect(vm.loading).toBe(true);
    expect(vm.error).toBe(false);
  });

  it("透传 error：接口失败数据 → vm.error=true，供页面渲染『加载失败/重试』而非空态『接入中』", () => {
    const vm = buildAwardViewModel({ ...emptyData(), loading: false, error: true });
    expect(vm.error).toBe(true);
    expect(vm.loading).toBe(false);
  });

  it("就绪：有真数据且无错 → vm.loading=false, vm.error=false", () => {
    const vm = buildAwardViewModel(ccgpData());
    expect(vm.loading).toBe(false);
    expect(vm.error).toBe(false);
  });
});
