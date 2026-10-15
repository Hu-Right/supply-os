/**
 * 首页热门「品目」聚合 — 必须按骨架大类聚合（Task 14）
 *
 * 为什么这条必须改：旧实现读的是旧品目字典表的 level=1 行（A..J 十个
 * 字母容器）配上宽表 `precise_level1`，而界面文案与点进去的筛选都是 32 品目大类 ——
 * 首页写着「品目」，数据却是旧容器，两个口径差了 3.2 倍粒度（一个容器最多跨 14 个大类）。
 * 同类问题在行业墙那一批已经实测过：同容器不同大类的两个用户可见内容完全一样。
 *
 * 钉住三件事：
 * 1. SQL 不再出现旧字典与 precise_levelN，也不再读 group_code（2026-10-15 G 码退役，
 *    大类身份 = L1 树码本身，展示名 = 树名 name_zh）；
 * 2. 计数走 32 个骨架 L1 行与 backbone_path 的**包含**关系（FIND_IN_SET），不是链顶：
 *    链顶就是「该公告的最小大类」，实测跨大类公告占 6.3%（temp/probe92），最大一档少 13.4%
 *    并且 TOP8 换位 —— 而点进去用的谓词就是同一条包含关系（filter-builder），标称必须等于兑现；
 * 3. 响应形状只剩前端真消费的字段：{code(L1 树码), nameZh(树名), count}。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LEGACY_DICT_TABLE } from "../../../../helpers/legacy-targets";

vi.mock("@/lib/services/notice-search/countries", () => ({
  getNoticeCountries: vi.fn(async () => [{ country: "CN", count: 5 }]),
}));

import { getHotTopics, clearHotTopicsCache, HOT_TOP_GROUPS_SQL } from "@/lib/services/notice-search/hot-topics";
import type { Pool } from "mysql2/promise";

const L1_ROWS = [
  { code: "UGT-01", name_zh: "建筑施工与运维服务", cnt: 49236 },
  { code: "UGT-02", name_zh: "加工制造与代工服务", cnt: 38832 },
];

const pool = {
  query: vi.fn(async () => [L1_ROWS]),
} as unknown as Pool;

beforeEach(() => {
  clearHotTopicsCache();
  (pool.query as ReturnType<typeof vi.fn>).mockClear();
});

describe("热门品目按骨架 L1 聚合", () => {
  it("SQL 读 backbone_path 与骨架 L1 行，不读旧字典/precise_levelN/group_code", () => {
    expect(HOT_TOP_GROUPS_SQL).toContain("crm_commodity_backbone");
    expect(HOT_TOP_GROUPS_SQL).toMatch(/b\.level = 1/);
    expect(HOT_TOP_GROUPS_SQL).toContain("backbone_path");
    expect(HOT_TOP_GROUPS_SQL).toContain("name_zh");
    expect(HOT_TOP_GROUPS_SQL).not.toContain("group_code");
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

  it("响应只给 {code, nameZh, count}：L1 树码即大类身份，树名即展示名（G 码退役后唯一口径）", async () => {
    const data = await getHotTopics(pool);
    expect(data.countries).toEqual([{ country: "CN", count: 5 }]);
    expect(data.industries).toEqual([
      { code: "UGT-01", nameZh: "建筑施工与运维服务", count: 49236 },
      { code: "UGT-02", nameZh: "加工制造与代工服务", count: 38832 },
    ]);
    expect(Object.keys(data).sort()).toEqual(["countries", "industries"]);
    // 一条聚合 SQL（旧的 level=2 码 TOP8 已删）
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
