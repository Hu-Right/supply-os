/**
 * filter-builder — 品目条件（commodityPath）的双方言谓词
 *
 * 品目筛选的唯一入口是 URL 的 `commodity`（骨架节点码，2/4/6/8/10 位）。
 * 两条方言与品目下拉、行业墙落在**同一条列**上（backbone_path），旧字典 id 空间与
 * precise 口径均已彻底退出检索链路。
 *
 * 断言强度：
 * 1. 品目条件走 backbone_node ↔ backbone_path —— 属性名与列名必须成对，写串就是整条检索静默降级；
 * 2. 脏节点码在参数归一化阶段即被丢弃 → 不产生任何条件（不报错、不 conflictEmpty）；
 * 3. 旧字典列名与 precise 口径一个都不许再出现（levelN_id / 旧品类码 / precise_level / precise_backbone_path）。
 *
 * 2026-11-12：原「类目条件（category）」三参形态随 prefs 模式退役删除，本文件改用
 * `commodityPath` 覆盖同一对形状；prefs 专属的「脏码 digest 留痕」断言一并移除。
 */
import { describe, it, expect } from "vitest";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { validateParams } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

/** 本文件所有用例都不该触发库查询：品目分支是纯拼接（country 快照除外，base 不带国家） */
const pool = {
  query: async () => {
    throw new Error("品目分支不应查库");
  },
} as unknown as Pool;
const existsOn = (col: string) =>
  `EXISTS (SELECT 1 FROM notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.${col}))`;

describe("buildFilterPlan 品目条件（骨架节点码口径）", () => {
  it("节点码：backbone_node ↔ backbone_path，与下拉/墙同一对形状", async () => {
    const p = validateParams({ commodityPath: "UGT-070201" });
    const plan = await buildFilterPlan(pool, p);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('backbone_node = "UGT-070201"');
    expect(plan.mysqlWhere).toContain(existsOn("backbone_path"));
    expect(plan.mysqlParams).toContain("UGT-070201");
    expect(plan.digest).toContain("commodity:UGT-070201");
  });

  it("脏节点码：参数归一化即丢弃，不拼条件也不报错", async () => {
    const p = validateParams({ commodityPath: "721015" });
    const plan = await buildFilterPlan(pool, p);
    expect(plan.meiliFilters).toEqual([]);
    expect(plan.mysqlWhere).toEqual([]);
    expect(plan.mysqlParams).toEqual([]);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.digest).toBe("none");
  });

  it("不传品目：没有任何品目条件", async () => {
    const plan = await buildFilterPlan(pool, validateParams({}));
    expect(plan.meiliFilters).toEqual([]);
    expect(plan.digest).toBe("none");
  });

  it("旧字典列彻底退出：levelN_id 与任何 *_level1~5 都不许出现", async () => {
    const p = validateParams({ q: "water", commodityPath: "UGT-30" });
    const plan = await buildFilterPlan(pool, p);
    expect(plan.meiliFilters.join(" ")).not.toMatch(/level[1-5]_id/);
    expect(plan.mysqlWhere.join(" ")).not.toMatch(/_level[1-5]\b/);
  });
});
