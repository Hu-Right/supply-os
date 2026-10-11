/**
 * filter-builder — 品目大类（groupCode）双方言谓词单测
 *
 * 断言的是「口径单一事实源」这条红线：同一个大类必须同时落成
 *   Meili  level2_id = "id1" OR level2_id = "id2"
 *   MySQL  EXISTS(... FIND_IN_SET(? , ns.unspsc_level2) OR ...)
 * 且参数顺序与占位符一一对应 —— 任一侧漏掉一个段，降级路径与主路径就会给出不同结果集。
 *
 * 注意：getGroupSegmentIds 有模块级 10 分钟缓存，本文件内的用例顺序即依赖顺序
 * （第一个用例灌缓存，后续用例复用同一份缓存），不要拆成两个 describe 并行跑。
 */
import { describe, it, expect } from "vitest";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { validateParams } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

/** 旧字典 level=2 的段行 id（此处用 81/82 两段模拟工程技术与设计研究服务 UGT-G-14） */
const SEG_ROWS = [
  { g: "UGT-G-14", id: "100011" },
  { g: "UGT-G-14", id: "100012" },
];

function fakePool(): Pool {
  return {
    query: async (sql: string) => {
      if (String(sql).includes("crm_commodity_group_segments")) return [SEG_ROWS];
      return [[]];
    },
  } as unknown as Pool;
}

describe("buildFilterPlan 品目大类筛选", () => {
  it("合法大类：Meili 与 MySQL 两条方言覆盖同一批段 id", async () => {
    const p = validateParams({ groupCode: "UGT-G-14" });
    expect(p.groupCode).toBe("UGT-G-14");

    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain(
      '(level2_id = "100011" OR level2_id = "100012")',
    );
    const exists = plan.mysqlWhere.find((w) => w.includes("ns.unspsc_level2"));
    expect(exists).toBeTruthy();
    expect(exists).toContain("EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id");
    // 占位符个数必须与参数个数一致，否则 FIND_IN_SET 静默错位（少一个段=少一类公告）
    expect((exists!.match(/\?/g) || []).length).toBe(2);
    expect(plan.mysqlParams).toEqual(["100011", "100012"]);
    expect(plan.digest).toContain("group:UGT-G-14");
  });

  it("非 32 类常量内的码被 validateParams 丢弃，不参与筛选", () => {
    expect(validateParams({ groupCode: "UGT-G-99" }).groupCode).toBeUndefined();
    expect(validateParams({ groupCode: "' OR 1=1" }).groupCode).toBeUndefined();
    expect(validateParams({}).groupCode).toBeUndefined();
  });

  it("大类在库内挂不上任何段：直接空结果，不静默放宽为全量", async () => {
    const p = validateParams({ groupCode: "UGT-G-05" }); // 缓存里没有 05 的段行
    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.conflictEmpty).toBe(true);
    expect(plan.digest).toBe("GROUP_NO_SEGMENT:UGT-G-05");
    expect(plan.meiliFilters).toEqual([]);
    expect(plan.mysqlWhere).toEqual([]);
  });

  it("大类与五级联动选中码叠加为 AND（两条条件都进 plan）", async () => {
    const p = validateParams({ groupCode: "UGT-G-14" });
    const plan = await buildFilterPlan(fakePool(), p, { level: 3, id: "100002", precise: false });
    expect(plan.meiliFilters.some((f) => f === 'level3_id = "100002"')).toBe(true);
    expect(plan.meiliFilters.some((f) => f.includes("level2_id"))).toBe(true);
  });
});
