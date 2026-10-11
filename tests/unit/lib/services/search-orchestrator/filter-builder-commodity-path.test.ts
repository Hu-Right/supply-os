/**
 * filter-builder — 品目树五级筛选（commodityPath）双方言谓词单测
 *
 * 钉住三件事：
 * 1. 参数校验只放行 2/4/6/8 位数字前缀（其它一律丢弃，不进入 SQL）；
 * 2. 两条方言落在同一份数据上（Meili commodity_prefix 数组属性 ↔ MySQL code_path 等值），
 *    不允许出现「主路径筛 code_path、降级路径筛 unspsc_levelN」这种两套口径；
 * 3. 单值谓词不带 OR —— 上一版大类筛选就是因为 OR 未整体括号导致 EXISTS 恒真（见
 *    filter-builder-group.test.ts 的回归断言），这里连形制都不同，必须单独钉。
 */
import { describe, it, expect } from "vitest";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { validateParams, searchCacheKey } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

/** 段行只在「与大类叠加」的用例里需要；code_path 谓词本身不查任何表（值直接来自 URL 前缀） */
function fakePool(segRows: Array<{ g: string; id: string }> = []): Pool {
  return {
    query: async (sql: string) =>
      String(sql).includes("crm_commodity_group_segments") ? [segRows] : [[]],
  } as unknown as Pool;
}

describe("validateParams 品目树筛选键", () => {
  it("接受 2/4/6/8 位数字前缀", () => {
    for (const key of ["72", "7210", "721015", "72101501"]) {
      expect(validateParams({ commodityPath: key }).commodityPath).toBe(key);
    }
  });

  it("奇数位、超长、非数字、注入串一律丢弃", () => {
    for (const bad of ["7", "721", "72101", "7210150", "721015011", "abc", "72;DROP", "' OR 1=1", ""]) {
      expect(validateParams({ commodityPath: bad }).commodityPath).toBeUndefined();
    }
  });

  it("不同前缀生成不同缓存键（否则两类筛选结果互相串台）", () => {
    const a = searchCacheKey(validateParams({ commodityPath: "72" }));
    const b = searchCacheKey(validateParams({ commodityPath: "7210" }));
    const c = searchCacheKey(validateParams({}));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("buildFilterPlan 品目树筛选", () => {
  it("Meili 与 MySQL 两条方言都按 code_path 的等值前缀项筛", async () => {
    const p = validateParams({ commodityPath: "7210" });
    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('commodity_prefix = "7210"');
    expect(plan.mysqlWhere).toContain(
      "EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.code_path))",
    );
    expect(plan.mysqlParams).toEqual(["7210"]);
    expect(plan.digest).toContain("commodity:7210");
  });

  it("谓词只有一个占位符且与参数一一对应；不引用 unspsc_levelN（避免退回旧字典口径）", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ commodityPath: "72101501" }));
    const clause = plan.mysqlWhere.find((w) => w.includes("code_path"))!;
    expect((clause.match(/\?/g) || []).length).toBe(1);
    expect(clause).not.toContain(" OR ");
    expect(plan.mysqlWhere.join(" ")).not.toContain("unspsc_level");
    expect(plan.meiliFilters.join(" ")).not.toContain("level5_id");
  });

  it("与大类 chip 叠加为 AND（大类 + 段是同一条链的逐级收窄）", async () => {
    const p = validateParams({ commodityPath: "72", groupCode: "UGT-G-11" });
    const plan = await buildFilterPlan(fakePool([{ g: "UGT-G-11", id: "100081" }]), p);
    expect(plan.meiliFilters.some((f) => f.includes("commodity_prefix"))).toBe(true);
    expect(plan.digest).toContain("group:UGT-G-11");
    expect(plan.digest).toContain("commodity:72");
  });
});
