/**
 * filter-builder — 国家筛选双方言谓词单测（国家码口径）
 *
 * 钉住：
 * 1. 命中表内国家 → Meili 走数组 facet `country_codes = "<ISO2>"`、MySQL 走服务表主国家
 *    `p.country_code = ?`，参数用 ISO2 码。**不得**回退成按展示名等值：索引里的 `country`
 *    是主表原始写法（Korea/US/Czech Republic…），与 canonical 不一致时会把整国筛没
 *    （2026-11-18~25 事故：韩国 13,733 → 1）；
 * 2. 表里没有该国家 → conflictEmpty 空集（不兜底），绝不产出可命中全表的谓词；
 * 3. FORCE_COUNTRY 与用户国家按表内码判等，同国不同写法不误判冲突。
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";
import { buildFilterPlan } from "@/lib/services/search-orchestrator/filter-builder";
import { validateParams } from "@/lib/services/search-orchestrator/params";
import { __resetCountryAliasStoreForTest } from "@/lib/services/country/alias-store";

const ALIAS_ROWS = [
  { canonical: "Brazil", country_code: "BR", alias: "Brazil", kind: "country", name_i18n: null },
  { canonical: "Brazil", country_code: "BR", alias: "Brasil", kind: "country", name_i18n: null },
  // 韩国：主表原始写法 "Korea" ≠ canonical "South Korea"——正是事故形态
  { canonical: "South Korea", country_code: "KR", alias: "Korea", kind: "country", name_i18n: null },
  { canonical: "South Korea", country_code: "KR", alias: "韩国", kind: "country", name_i18n: null },
  { canonical: "South Korea", country_code: "KR", alias: "South Korea", kind: "country", name_i18n: null },
];
function fakePool(): Pool {
  return {
    query: async (sql: string) => (String(sql).includes("country_aliases") ? [ALIAS_ROWS] : [[]]),
  } as unknown as Pool;
}

beforeEach(() => __resetCountryAliasStoreForTest());

describe("buildFilterPlan 国家筛选", () => {
  it("命中表内国家 → Meili 用国家码 facet、MySQL 用服务表主国家，参数为 ISO2 码", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ country: "Brasil" }));
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('country_codes = "BR"');
    expect(plan.mysqlWhere).toContain("p.country_code = ?");
    expect(plan.mysqlParams).toContain("BR");
  });

  it("原始写法 ≠ canonical（韩国）→ 仍按码筛，不得按国名等值", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ country: "韩国" }));
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('country_codes = "KR"');
    // 反例守卫：一旦有人改回按展示名筛，这里必须变红
    expect(plan.meiliFilters.join(" ")).not.toMatch(/country\s*=\s*"/);
    expect(plan.mysqlParams).toContain("KR");
  });

  it("表里没有该国家 → conflictEmpty 空集（不兜底、不放行）", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ country: "Neverland" }));
    expect(plan.conflictEmpty).toBe(true);
    expect(plan.digest).toContain("country:no-code:Neverland");
  });
});
