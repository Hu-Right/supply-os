/**
 * onCountryAliasesChanged 编排单测：失效三级缓存 → fullBackfill 重算 → 标记 Meili 重建（顺序即正确性）。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/country/alias-store", () => ({ invalidateCountryAliasCache: vi.fn() }));
vi.mock("@/lib/services/notice-search/countries", () => ({ clearCountriesCache: vi.fn() }));
vi.mock("@/lib/services/search-common/sync-events", () => ({ invalidateSearchCache: vi.fn() }));
vi.mock("@/lib/services/search-common/rebuild-trigger", () => ({ requestIndexRebuild: vi.fn() }));
vi.mock("@/lib/services/search-sync/sync-scheduler", () => ({ fullBackfill: vi.fn().mockResolvedValue({ synced: 1, elapsed: 1 }) }));

import { onCountryAliasesChanged } from "@/lib/services/search-sync/country-alias-refresh";
import { invalidateCountryAliasCache } from "@/lib/services/country/alias-store";
import { clearCountriesCache } from "@/lib/services/notice-search/countries";
import { invalidateSearchCache } from "@/lib/services/search-common/sync-events";
import { fullBackfill } from "@/lib/services/search-sync/sync-scheduler";
import { requestIndexRebuild } from "@/lib/services/search-common/rebuild-trigger";

describe("onCountryAliasesChanged", () => {
  it("先清三级缓存→再宽表全量回填→最后标记 Meili 重建（顺序不可颠倒）", async () => {
    const pool = {} as unknown as Pool;
    const res = await onCountryAliasesChanged(pool);
    expect(invalidateCountryAliasCache).toHaveBeenCalled();
    expect(clearCountriesCache).toHaveBeenCalled();
    expect(invalidateSearchCache).toHaveBeenCalled();
    expect(fullBackfill).toHaveBeenCalledTimes(1);
    expect(requestIndexRebuild).toHaveBeenCalledWith("country-aliases-changed");
    expect(res).toEqual({ backfilled: 1 });

    const order = [
      (invalidateCountryAliasCache as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0],
      (fullBackfill as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0],
      (requestIndexRebuild as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]); // 清缓存早于回填
    expect(order[1]).toBeLessThan(order[2]); // 回填早于 Meili 重建
  });
});
