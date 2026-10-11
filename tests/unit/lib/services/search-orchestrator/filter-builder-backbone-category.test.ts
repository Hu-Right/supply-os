/**
 * filter-builder — 类目条件（category）的双方言谓词（Task 9：prefs 同口径收尾）
 *
 * 这一分支是全系统唯一还在读旧字典 `levelN_id / precise_levelN` 的地方：
 * default 模式的 `?code_id` 与 prefs 模式的渐进放宽都从这里出去。
 * 换成骨架节点码后，两条方言与品目下拉、大类 chip、可见性判定落在**同一条列**上
 * （backbone_path / precise_backbone_path），旧字典 id 空间彻底退出检索链路。
 *
 * 断言强度：
 * 1. precise=false 走 backbone_path、precise=true 走 precise_backbone_path —— 两条列
 *    形状一样、语义差一倍覆盖量，写串了不报错，只会让 prefs 静默变成全量口径；
 * 2. Meili 属性名与 MySQL 列名必须成对（backbone_node ↔ backbone_path、
 *    precise_backbone_node ↔ precise_backbone_path），少一个就是整条检索静默降级；
 * 3. 脏节点码：不产生类目条件、不报错、不 conflictEmpty（与旧实现"忽略行业过滤"一致），
 *    但必须在 digest 里留下 rejected 痕迹，否则排查时看不见；
 * 4. 旧字典列名一个都不许再出现（levelN_id / unspsc_level / precise_level）。
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
  `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.${col}))`;

describe("buildFilterPlan 类目条件（骨架节点码口径）", () => {
  it("precise=false：backbone_node ↔ backbone_path，与下拉/chip 同一对形状", async () => {
    const plan = await buildFilterPlan(pool, base, { node: "UGT-B-070201", precise: false });
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('backbone_node = "UGT-B-070201"');
    expect(plan.mysqlWhere).toContain(existsOn("backbone_path"));
    expect(plan.mysqlParams).toContain("UGT-B-070201");
    expect(plan.digest).toContain("cat:UGT-B-070201");
  });

  it("precise=true：precise_backbone_node ↔ precise_backbone_path（两条列不能互换）", async () => {
    const plan = await buildFilterPlan(pool, base, { node: "UGT-B-0702010204", precise: true });
    expect(plan.meiliFilters).toContain('precise_backbone_node = "UGT-B-0702010204"');
    expect(plan.mysqlWhere).toContain(existsOn("precise_backbone_path"));
    // 这里必须按数组元素比而不是拼串后 includes：`precise_backbone_node = "…"`
    // 本来就子串包含 `backbone_node = "…"`，拼串断言会假绿
    expect(plan.meiliFilters).not.toContain('backbone_node = "UGT-B-0702010204"');
    expect(plan.mysqlWhere).not.toContain(existsOn("backbone_path"));
    expect(plan.digest).toContain("cat:UGT-B-0702010204:precise");
  });

  it("脏节点码：不拼条件、不报错、不 conflictEmpty，但 digest 留痕", async () => {
    const plan = await buildFilterPlan(pool, base, { node: "721015", precise: false });
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

  it("旧字典列彻底退出：levelN_id / unspsc_level / precise_level 都不许出现", async () => {
    const full = validateParams({ q: "water", codeId: 123456 });
    const plan = await buildFilterPlan(pool, full, { node: "UGT-B-30", precise: true });
    expect(plan.meiliFilters.join(" ")).not.toMatch(/level[1-5]_id/);
    expect(plan.mysqlWhere.join(" ")).not.toMatch(/unspsc_level|precise_level/);
  });
});
