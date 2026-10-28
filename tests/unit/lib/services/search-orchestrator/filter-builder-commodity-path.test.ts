/**
 * filter-builder — 品目骨架五级筛选（commodityPath）双方言谓词单测
 *
 * 钉住四件事：
 * 1. 参数校验只放行骨架节点码（`UGT-` + 2/4/6/8/10 位），其它一律丢弃、不进入 SQL；
 *    **旧的旧品类码数字前缀不再合法** —— 它在 backbone_path 里根本不存在，放进来等于筛出空集还不报错。
 * 2. 两条方言落在同一份数据上（Meili backbone_node 数组属性 ↔ MySQL backbone_path 等值），
 *    不允许出现「主路径筛 backbone_path、降级路径筛旧品类码」这种两套口径；
 * 3. 单值谓词不带 OR —— 上一版大类筛选就是因为 OR 未整体括号导致 EXISTS 恒真（见
 *    filter-builder-group.test.ts 的回归断言），这里连形制都不同，必须单独钉；
 * 4. 谓词里出现的列必须是 backbone_path，不回退 code_path（那是公告的旧品类码祖先前缀，另一套口径）。
 */
import { describe, expect, it } from "vitest";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { searchCacheKey, validateParams } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

/** 骨架 L1 行只在「与大类叠加」的用例里需要（大类→L1 节点码要映射一次）；
 * backbone_path 谓词本身不查任何表 —— 选中码直接就是参数 */
function fakePool(l1Rows: Array<{ g: string; node: string }> = []): Pool {
  return {
    query: async (sql: string) =>
      String(sql).includes("commodity_backbone") ? [l1Rows] : [[]],
  } as unknown as Pool;
}

describe("validateParams 骨架节点筛选键", () => {
  it("接受 UGT- 的 2/4/6/8/10 位节点码", () => {
    for (const key of ["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]) {
      expect(validateParams({ commodityPath: key }).commodityPath).toBe(key);
    }
  });

  it("裸数字旧码、奇数位、非数字、注入串一律丢弃", () => {
    for (const bad of ["72", "7210", "72101501", "UGT-1", "UGT-010", "UGT-010101010101", "abc", "UGT-C-41", "' OR 1=1", ""]) {
      expect(validateParams({ commodityPath: bad }).commodityPath).toBeUndefined();
    }
  });

  it("不同节点码生成不同缓存键（否则两类筛选结果互相串台）", () => {
    const a = searchCacheKey(validateParams({ commodityPath: "UGT-01" }));
    const b = searchCacheKey(validateParams({ commodityPath: "UGT-0101" }));
    const c = searchCacheKey(validateParams({}));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("buildFilterPlan 骨架节点筛选", () => {
  it("Meili 与 MySQL 两条方言都按 backbone_path 的等值节点项筛", async () => {
    const p = validateParams({ commodityPath: "UGT-0101" });
    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('backbone_node = "UGT-0101"');
    expect(plan.mysqlWhere).toContain(
      "EXISTS (SELECT 1 FROM notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.backbone_path))",
    );
    expect(plan.mysqlParams).toEqual(["UGT-0101"]);
    expect(plan.digest).toContain("commodity:UGT-0101");
  });

  it("谓词只有一个占位符且与参数一一对应；不引用任何 *_level1~5，也不回退 code_path", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ commodityPath: "UGT-01010101" }));
    const clause = plan.mysqlWhere.find((w) => w.includes("backbone_path"))!;
    expect((clause.match(/\?/g) || []).length).toBe(1);
    expect(clause).not.toContain(" OR ");
    expect(plan.mysqlWhere.join(" ")).not.toMatch(/_level[1-5]\b/);
    expect(plan.mysqlWhere.join(" ")).not.toContain("code_path");
    expect(plan.meiliFilters.join(" ")).not.toContain("level5_id");
    expect(plan.meiliFilters.join(" ")).not.toContain("commodity_prefix");
  });

  it("传 L1 码即大类筛选（G 码退役后大类 chip 并入 commodity 参数），digest 带码", async () => {
    const p = validateParams({ commodityPath: "UGT-01" });
    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.meiliFilters.some((f) => f.includes("backbone_node"))).toBe(true);
    expect(plan.digest).toContain("commodity:UGT-01");
    // 旧 group 参数已退役：参数与谓词里都不应再出现
    expect(plan.digest).not.toContain("group:");
  });
});
