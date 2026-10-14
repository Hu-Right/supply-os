/**
 * awards.service 单元测试
 * @module tests/unit/lib/services/awards.service.test.ts
 * @description 覆盖中标情报 service 的编排逻辑：分页元数据计算、排行总数。
 *              （公告历史中标 getAwardHistoryForNotice 已随 旧品类码 小表剥离
 *              整链下线 2026-10-14——crm_bid_awards.旧品类码 全表 0 行，零数据空转。）
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
  getTopWinners,
} from "@/lib/services/awards.service";

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
});

describe("getTopWinners", () => {
  it("返回 items 且 total 等于条数", async () => {
    topWinners.mockResolvedValue([{ name: "A" }, { name: "B" }]);
    const res = await getTopWinners(POOL, 10);
    expect(topWinners).toHaveBeenCalledWith(10);
    expect(res).toEqual({ items: [{ name: "A" }, { name: "B" }], total: 2 });
  });
});
