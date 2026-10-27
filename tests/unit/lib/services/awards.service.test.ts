/**
 * awards.service 单元测试
 * @module tests/unit/lib/services/awards.service.test.ts
 * @description 覆盖中标情报 service 的编排逻辑：分页元数据计算、排行总数。
 *              （公告历史中标 getAwardHistoryForNotice 已随旧品类码小表剥离
 *              整链下线 2026-10-14——crm_bid_awards 的旧码列全表 0 行，零数据空转。）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { list, getStats, topWinners } = vi.hoisted(() => ({
  list: vi.fn(),
  getStats: vi.fn(),
  topWinners: vi.fn(),
}));

vi.mock("@/lib/repos/awards.repo", () => ({
  AwardsRepo: function (this: any) {
    Object.assign(this, { list, getStats, topWinners });
  },
}));

import {
  listAwards,
  getAwardStats,
  getTopWinners,
} from "@/lib/services/awards.service";

/** 递归收集对象键（含嵌套数组元素），用于「整树不得有 snake 键」 */
const SNAKE_KEY = /[a-z0-9]_[a-z0-9]/;
function allKeys(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) allKeys(item, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}
const expectNoSnake = (payload: unknown) => {
  expect([...new Set(allKeys(payload).filter((k) => SNAKE_KEY.test(k)))]).toEqual([]);
};

const POOL = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAwards", () => {
  it("补全分页元数据 total_pages（向上取整）并回显 page/page_size", async () => {
    list.mockResolvedValue({ items: [{ id: 1 }, { id: 2 }], total: 5 });
    const res = await listAwards(POOL, { page: 2, pageSize: 2, agency: "TED" });
    expect(res).toMatchObject({ total: 5, page: 2, page_size: 2, total_pages: 3 });
    // filters 透传给 repo（含 page/pageSize）
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 2, agency: "TED" });
  });

  it("total=0 → total_pages=0", async () => {
    list.mockResolvedValue({ items: [], total: 0 });
    const res = await listAwards(POOL, { page: 1, pageSize: 20 });
    expect(res.total_pages).toBe(0);
  });

  it("items 是对外视图：列名改 camel，采集溯源列与爬虫原始载荷不下发", async () => {
    list.mockResolvedValue({
      items: [{
        id: 1, title: "某项目", title_cn: "某项目中文", reference: "R-1",
        contract_no: "C-1", agency: "某局", agency_full: "某局全称", country: "CN",
        award_date: "2026-09-01", contract_value: 100, contract_value_usd: 100,
        currency: "USD", description: "d", description_cn: "中文描述",
        category: "工程", industry: "IT", source_platform: "ccgp",
        // 不该出网的列
        source_url: "https://src.example/1", external_id: "EXT-1",
        source_notice_id: "9", raw_data: { any: "payload" }, crawl_time: "2026-09-02 00:00:00",
      }],
      total: 1,
    });
    const res = await listAwards(POOL, { page: 1, pageSize: 20 });

    expectNoSnake(res.items[0]);
    expect(res.items[0].titleCn).toBe("某项目中文");
    expect(res.items[0].contractValueUsd).toBe(100);
    expect(res.items[0].sourcePlatform).toBe("ccgp");
    for (const leaked of ["sourceUrl", "source_url", "externalId", "sourceNoticeId", "rawData", "crawlTime"]) {
      expect(res.items[0]).not.toHaveProperty(leaked);
    }
    // 分页元数据按口径保持原名（它们不是实体字段）
    expect(res).toMatchObject({ page_size: 20, total_pages: 1 });
  });
});

describe("getAwardStats", () => {
  it("聚合别名经视图后全为 camel（含分组数组元素）", async () => {
    getStats.mockResolvedValue({
      total: 1669,
      total_value_usd: 1000,
      by_agency: [{ agency: "某局", count: 3, total_usd: 10 }],
      by_country: [{ country: "CN", count: 3 }],
      by_month: [{ month: "2026-09", count: 3, total_usd: 10 }],
      top_winners: [{ name: "甲公司", count: 2, total_usd: 8, country: "CN" }],
    });
    const stats = await getAwardStats(POOL);

    expectNoSnake(stats);
    expect(stats.totalValueUsd).toBe(1000);
    expect(stats.byAgency[0].totalUsd).toBe(10);
    expect(stats.byMonth[0].totalUsd).toBe(10);
    expect(stats.topWinners[0].totalUsd).toBe(8);
  });
});

describe("getTopWinners", () => {
  it("返回 items 且 total 等于条数，行键全为 camel", async () => {
    topWinners.mockResolvedValue([{ name: "A", total_usd: 5 }, { name: "B", total_usd: 0 }]);
    const res = await getTopWinners(POOL, 10);
    expect(topWinners).toHaveBeenCalledWith(10);
    expectNoSnake(res);
    expect(res).toEqual({ items: [{ name: "A", totalUsd: 5 }, { name: "B", totalUsd: 0 }], total: 2 });
  });
});
