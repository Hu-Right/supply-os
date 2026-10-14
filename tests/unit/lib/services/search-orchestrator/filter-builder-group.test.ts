/**
 * filter-builder — 品目大类（groupCode）双方言谓词单测
 *
 * 2026-10-11 backbone 化：大类不再翻译成「旧字典 level=2 段行 id」的 OR 集合，
 * 而是翻译成骨架 L1 节点码（UGT-xx），与五级下拉、行业墙落在**同一条列**上
 * （MySQL：宽表 backbone_path 的等值节点项 / Meili：backbone_node 数组属性）。
 * 等价性实测：temp/probe75 逐类对拍 32 个大类，旧段 id 谓词与新节点码谓词命中数 Δ=0、不一致 0/32。
 *
 * 断言强度一条都不许降：
 * 1. 两条方言覆盖同一批值，参数与占位符一一对应（少一个值 = 静默漏一类公告）；
 * 2. 多值 OR 必须整体括号 —— 上一版就是 `AND A OR B` 让 B 脱离 `ns.id = n.id` 的相关关系，
 *    EXISTS 对全表恒真、筛选静默失效（2026-10-11 端到端实测：双段大类 UGT-G-14 降级路径
 *    返回 190,041 条未筛结果，首页 10 条全部不属于该类）；
 *    当前库内每个大类恰挂一个 L1 行（probe75），但实现必须支持多值：将来灌进第二个 L1 行时，
 *    只取第一个就是静默漏类，所以这里专门造一个多 L1 的大类来钉；
 * 3. 大类在库内挂不上任何 L1：直接空结果，不静默放宽为全量；
 * 4. 谓词里不许再出现 旧五级列 / level2_id（回退到旧字典就是分叉）。
 *
 * 注意：groupCode→L1 映射有模块级 10 分钟缓存，本文件共用同一份 fake 图（第一个用例灌入，
 * 后续复用），用例顺序即依赖顺序，不要拆成两个 describe 并行跑。
 */
import { describe, it, expect } from "vitest";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { validateParams } from "@/lib/services/search-orchestrator/params";
import type { Pool } from "mysql2/promise";

/** 骨架 L1 行（字段名 = SQL 里的列别名 g / node）：UGT-G-14 故意挂两个，用来钉「多值必须整体括号」 */
const L1_ROWS = [
  { g: "UGT-G-14", node: "UGT-21" },
  { g: "UGT-G-14", node: "UGT-22" },
  { g: "UGT-G-11", node: "UGT-01" },
];

function fakePool(): Pool {
  return {
    query: async (sql: string) => {
      if (String(sql).includes("crm_commodity_backbone")) return [L1_ROWS];
      return [[]];
    },
  } as unknown as Pool;
}

describe("buildFilterPlan 品目大类筛选（backbone 口径）", () => {
  it("恰挂一个 L1 的大类：与五级下拉同一条谓词，单值不带 OR", async () => {
    const p = validateParams({ groupCode: "UGT-G-11" });
    expect(p.groupCode).toBe("UGT-G-11");

    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('backbone_node = "UGT-01"');
    const exists = plan.mysqlWhere.find((w) => w.includes("backbone_path"));
    expect(exists).toBeTruthy();
    expect(exists).toBe(
      "EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.backbone_path))",
    );
    expect((exists!.match(/\?/g) || []).length).toBe(1);
    expect(exists).not.toContain(" OR ");
    expect(plan.mysqlParams).toEqual(["UGT-01"]);
    expect(plan.digest).toContain("group:UGT-G-11");
  });

  it("挂两个 L1 的大类：OR 仍在同一对括号里，占位符与参数一一对应", async () => {
    const p = validateParams({ groupCode: "UGT-G-14" });
    const plan = await buildFilterPlan(fakePool(), p);
    const exists = plan.mysqlWhere.find((w) => w.includes("backbone_path"))!;
    expect(exists).toContain(
      "AND (FIND_IN_SET(?, ns.backbone_path) OR FIND_IN_SET(?, ns.backbone_path))",
    );
    // 不能出现脱离相关子句的裸 AND/OR 组合（历史 BUG 的形状）
    expect(exists).not.toContain("ns.id = n.id AND FIND_IN_SET(?, ns.backbone_path) OR");
    expect((exists.match(/\?/g) || []).length).toBe(2);
    expect(plan.mysqlParams).toEqual(["UGT-21", "UGT-22"]);
    expect(plan.meiliFilters).toContain('(backbone_node = "UGT-21" OR backbone_node = "UGT-22")');
  });

  it("不再读旧字典：谓词里既不出现 unspsc_level2 也不出现 level2_id", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ groupCode: "UGT-G-14" }));
    expect(plan.mysqlWhere.join(" ")).not.toContain("unspsc_level");
    expect(plan.meiliFilters.join(" ")).not.toContain("level2_id");
  });

  it("非 32 类常量内的码被 validateParams 丢弃，不参与筛选", () => {
    expect(validateParams({ groupCode: "UGT-G-99" }).groupCode).toBeUndefined();
    expect(validateParams({ groupCode: "' OR 1=1" }).groupCode).toBeUndefined();
    expect(validateParams({}).groupCode).toBeUndefined();
  });

  it("大类在库内挂不上任何 L1：直接空结果，不静默放宽为全量", async () => {
    const p = validateParams({ groupCode: "UGT-G-05" }); // 假图里没有 05 的 L1 行
    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.conflictEmpty).toBe(true);
    expect(plan.digest).toBe("GROUP_NO_L1_NODE:UGT-G-05");
    expect(plan.meiliFilters).toEqual([]);
    expect(plan.mysqlWhere).toEqual([]);
  });

  it("大类与五级联动选中码叠加为 AND（同一条链的逐级收窄）", async () => {
    const p = validateParams({ groupCode: "UGT-G-11", commodityPath: "UGT-0101" });
    const plan = await buildFilterPlan(fakePool(), p);
    expect(plan.meiliFilters.filter((f) => f.includes("backbone_node"))).toHaveLength(2);
    expect(plan.mysqlWhere.filter((w) => w.includes("backbone_path"))).toHaveLength(2);
    expect(plan.digest).toContain("group:UGT-G-11");
    expect(plan.digest).toContain("commodity:UGT-0101");
  });
});
