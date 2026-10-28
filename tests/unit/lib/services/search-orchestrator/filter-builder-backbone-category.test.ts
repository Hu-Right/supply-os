/**
 * filter-builder — 类目条件（category）的双方言谓词
 *
 * default 模式的 `?code_id` 与 prefs 模式的渐进放宽都从这里出去，统一落骨架节点码。
 * 换成骨架节点码后，两条方言与品目下拉、大类 chip、可见性判定落在**同一条列**上
 * （backbone_path），旧字典 id 空间与 precise 口径均已彻底退出检索链路。
 *
 * 断言强度：
 * 1. 类目条件走 backbone_node ↔ backbone_path —— 属性名与列名必须成对，写串就是整条检索静默降级；
 * 2. 脏节点码：不产生类目条件、不报错、不 conflictEmpty（与旧实现"忽略行业过滤"一致），
 *    但必须在 digest 里留下 rejected 痕迹，否则排查时看不见；
 * 3. 旧字典列名与 precise 口径一个都不许再出现（levelN_id / 旧品类码 / precise_level / precise_backbone_path）。
 */
import { describe, it, expect } from "vitest";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { validateParams } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

/** 本文件所有用例都不该触发库查询：类目分支是纯拼接 */
const pool = {
  query: async () => {
    throw new Error("类目分支不应查库");
  },
} as unknown as Pool;
const base = validateParams({});

const existsOn = (col: string) =>
  `EXISTS (SELECT 1 FROM notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.${col}))`;

describe("buildFilterPlan 类目条件（骨架节点码口径）", () => {
  it("节点码：backbone_node ↔ backbone_path，与下拉/chip 同一对形状", async () => {
    const plan = await buildFilterPlan(pool, base, { node: "UGT-070201" });
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('backbone_node = "UGT-070201"');
    expect(plan.mysqlWhere).toContain(existsOn("backbone_path"));
    expect(plan.mysqlParams).toContain("UGT-070201");
    expect(plan.digest).toContain("cat:UGT-070201");
  });

  it("脏节点码：不拼条件、不报错、不 conflictEmpty，但 digest 留痕", async () => {
    const plan = await buildFilterPlan(pool, base, { node: "721015" });
    expect(plan.meiliFilters).toEqual([]);
    expect(plan.mysqlWhere).toEqual([]);
    expect(plan.mysqlParams).toEqual([]);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.digest).toContain("cat:rejected:721015");
  });

  it("不传 / 传 null：与旧行为一致，没有任何类目条件", async () => {
    const a = await buildFilterPlan(pool, base);
    const b = await buildFilterPlan(pool, base, null);
    expect(a.meiliFilters).toEqual([]);
    expect(b.mysqlWhere).toEqual([]);
    expect(b.digest).toBe("none");
  });

  it("旧字典列彻底退出：levelN_id 与任何 *_level1~5 都不许出现", async () => {
    const full = validateParams({ q: "water", commodityPath: "UGT-30" });
    const plan = await buildFilterPlan(pool, full, { node: "UGT-30" });
    expect(plan.meiliFilters.join(" ")).not.toMatch(/level[1-5]_id/);
    expect(plan.mysqlWhere.join(" ")).not.toMatch(/_level[1-5]\b/);
  });
});
