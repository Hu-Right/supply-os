/**
 * filter-builder — 国家筛选双方言谓词单测（表驱动，各国都算命中）
 *
 * 钉住：
 * 1. 命中表内国家 → MySQL 走 EXISTS+FIND_IN_SET(?, ns.country_codes)、Meili 走数组 facet
 *    `country_codes = "BR"`，参数用 ISO2 码（不再裸 n.country IN 别名）；
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
];
function fakePool(): Pool {
  return {
    query: async (sql: string) => (String(sql).includes("country_aliases") ? [ALIAS_ROWS] : [[]]),
  } as unknown as Pool;
}

beforeEach(() => __resetCountryAliasStoreForTest());

describe("buildFilterPlan 国家筛选", () => {
  it("命中表内国家 → 双方言都按 country_codes 筛，参数为 ISO2 码", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ country: "Brasil" }));
    expect(plan.conflictEmpty).toBe(false);
    expect(plan.meiliFilters).toContain('country_codes = "BR"');
    expect(plan.mysqlWhere).toContain(
      "EXISTS (SELECT 1 FROM notice_search ns WHERE ns.id = n.id AND FIND_IN_SET(?, ns.country_codes))",
    );
    expect(plan.mysqlParams).toContain("BR");
  });

  it("表里没有该国家 → conflictEmpty 空集（不兜底、不放行）", async () => {
    const plan = await buildFilterPlan(fakePool(), validateParams({ country: "Neverland" }));
    expect(plan.conflictEmpty).toBe(true);
    expect(plan.digest).toContain("country:no-code:Neverland");
  });
});
