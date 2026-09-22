/**
 * awards.service 单元测试
 * @module tests/unit/lib/services/awards.service.test.ts
 * @description 覆盖中标情报 service 的编排逻辑：分页元数据计算、排行总数、
 *              以及公告历史中标的前缀去重 + 空码/不存在分支（route→service 下沉的回归护栏）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { list, getStats, topWinners, getByUnspscCodes, findById, normalizeUnspscCodes, unspscPrefixFromCode } =
  vi.hoisted(() => ({
    list: vi.fn(),
    getStats: vi.fn(),
    topWinners: vi.fn(),
    getByUnspscCodes: vi.fn(),
    findById: vi.fn(),
    normalizeUnspscCodes: vi.fn(),
    unspscPrefixFromCode: vi.fn(),
  }));

vi.mock("@/lib/repos/awards.repo", () => ({
  AwardsRepo: function (this: any) {
    Object.assign(this, { list, getStats, topWinners, getByUnspscCodes });
  },
}));

vi.mock("@/lib/repos/notices/index", () => ({
  NoticeDetailRepo: function (this: any) {
    Object.assign(this, { findById });
  },
}));

vi.mock("@/lib/services/unspsc/parser", () => ({
  normalizeUnspscCodes,
  unspscPrefixFromCode,
}));

import {
  listAwards,
  getTopWinners,
  getAwardHistoryForNotice,
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

describe("getAwardHistoryForNotice", () => {
  it("公告不存在 → 返回 null（供路由发 404）", async () => {
    findById.mockResolvedValue(null);
    const res = await getAwardHistoryForNotice(POOL, 1);
    expect(res).toBeNull();
    expect(getByUnspscCodes).not.toHaveBeenCalled();
  });

  it("公告无 UNSPSC 码 → 零值历史且 unspsc_matched 为空，不查库", async () => {
    findById.mockResolvedValue({ unspsc_codes: "[]" });
    normalizeUnspscCodes.mockReturnValue([]);
    const res = await getAwardHistoryForNotice(POOL, 1);
    expect(res).toMatchObject({ total: 0, total_value_usd: 0, unspsc_matched: [] });
    expect(getByUnspscCodes).not.toHaveBeenCalled();
  });

  it("有多个编码 → 前缀去重后查询，结果并入 unspsc_matched", async () => {
    findById.mockResolvedValue({ unspsc_codes: "[1,2,3]" });
    normalizeUnspscCodes.mockReturnValue([{ code: "A1" }, { code: "A2" }, { code: "B1" }]);
    // A1/A2 → 前缀 "A"（重复），B1 → "B"
    unspscPrefixFromCode.mockImplementation((c: string) => c[0]);
    getByUnspscCodes.mockResolvedValue({ total: 7, total_value_usd: 100, by_country: [], top_winners: [], recent_awards: [] });

    const res = await getAwardHistoryForNotice(POOL, 1);
    expect(getByUnspscCodes).toHaveBeenCalledWith(["A", "B"]);
    expect(res).toMatchObject({ total: 7, unspsc_matched: ["A", "B"] });
  });
});
