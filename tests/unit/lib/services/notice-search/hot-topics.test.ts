/**
 * 首页热门「品目」聚合 — 必须按骨架大类聚合（Task 14）
 *
 * 为什么这条必须改：旧实现读的是旧品目字典表的 level=1 行（A..J 十个
 * 字母容器）配上宽表 `precise_level1`，而界面文案与点进去的筛选都是 32 品目大类 ——
 * 首页写着「品目」，数据却是旧容器，两个口径差了 3.2 倍粒度（一个容器最多跨 14 个大类）。
 * 同类问题在行业墙那一批已经实测过：同容器不同大类的两个用户可见内容完全一样。
 *
 * 钉住三件事：
 * 1. SQL 不再出现旧字典与 precise_levelN（回退就是分叉）；
 * 2. 计数走 32 个骨架 L1 行与 backbone_path 的**包含**关系（FIND_IN_SET），不是链顶：
 *    链顶就是「该公告的最小大类」，实测跨大类公告占 6.3%（temp/probe92），最大一档少 13.4%
 *    并且 TOP8 换位 —— 而点进去用的谓词就是同一条包含关系（filter-builder），标称必须等于兑现；
 *    大类码由骨架 L1 行的 group_code 带出 —— 不靠「L1 码序号 = 大类码序号」的错觉
 *    （实测 32 行里只有 5 行相等）；
 * 3. 响应形状只剩前端真消费的字段：旧的 level=2 码 TOP8 字段（前端从不读），
 *    却是首页第三条全表 FIND_IN_SET 聚合 —— 删字段就是删一次无收益的开销。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LEGACY_DICT_TABLE } from "../../../../helpers/legacy-targets";

vi.mock("@/lib/services/notice-search/countries", () => ({
  getNoticeCountries: vi.fn(async () => [{ country: "CN", count: 5 }]),
}));

import { getHotTopics, clearHotTopicsCache, HOT_TOP_GROUPS_SQL } from "@/lib/services/notice-search/hot-topics";
import type { Pool } from "mysql2/promise";

const L1_ROWS = [
  { node: "UGT-01", code: "UGT-G-11", cnt: 49236 },
  { node: "UGT-02", code: "UGT-G-16", cnt: 38832 },
];

const pool = {
  query: vi.fn(async () => [L1_ROWS]),
} as unknown as Pool;

beforeEach(() => {
  clearHotTopicsCache();
  (pool.query as ReturnType<typeof vi.fn>).mockClear();
});

describe("热门品目按骨架 L1 聚合", () => {
  it("SQL 读 backbone_path 与骨架 L1 行，不读旧字典也不读 precise_levelN", () => {
    expect(HOT_TOP_GROUPS_SQL).toContain("crm_commodity_backbone");
    expect(HOT_TOP_GROUPS_SQL).toMatch(/b\.level = 1/);
    expect(HOT_TOP_GROUPS_SQL).toContain("backbone_path");
    expect(HOT_TOP_GROUPS_SQL).toContain("group_code");
    expect(HOT_TOP_GROUPS_SQL).not.toContain(LEGACY_DICT_TABLE);
    expect(HOT_TOP_GROUPS_SQL).not.toMatch(/_level[1-5]\b|level[1-5]_id/);
  });

  it("计数是包含关系，不是链顶（链顶=只数最小大类，与点进去的筛果分叉）", () => {
    expect(HOT_TOP_GROUPS_SQL).toMatch(/FIND_IN_SET\(b\.code, ns\.backbone_path\)/);
    expect(HOT_TOP_GROUPS_SQL).not.toMatch(/SUBSTRING_INDEX/);
  });

  it("有效公告谓词保持字面内联（与 utils/notice-expired 同一口径，静态扫描不吃插值）", () => {
    expect(HOT_TOP_GROUPS_SQL).toContain("(ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))");
  });

  it("响应只给 {node, code, count}：名称由前端按大类码取 locale，不在服务端混两套名字", async () => {
    const data = await getHotTopics(pool);
    expect(data.countries).toEqual([{ country: "CN", count: 5 }]);
    expect(data.industries).toEqual([
      { node: "UGT-01", code: "UGT-G-11", count: 49236 },
      { node: "UGT-02", code: "UGT-G-16", count: 38832 },
    ]);
    expect(Object.keys(data).sort()).toEqual(["countries", "industries"]);
    // 一条聚合 SQL（旧的 level=2 码 TOP8 已删）
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
