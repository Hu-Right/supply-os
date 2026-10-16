import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/agency/alias-store", () => ({ invalidateAgencyAliasCache: vi.fn() }));
vi.mock("@/lib/services/notice-search/agencies", () => ({ clearAgenciesCache: vi.fn() }));
vi.mock("@/lib/services/search-common/sync-events", () => ({ invalidateSearchCache: vi.fn() }));
vi.mock("@/lib/services/search-common/rebuild-trigger", () => ({ requestIndexRebuild: vi.fn() }));
vi.mock("@/lib/services/search-sync/sync-scheduler", () => ({ fullBackfill: vi.fn().mockResolvedValue({ synced: 1, elapsed: 1 }) }));

import { onAgencyAliasesChanged } from "@/lib/services/search-sync/agency-alias-refresh";
import { invalidateAgencyAliasCache } from "@/lib/services/agency/alias-store";
import { clearAgenciesCache } from "@/lib/services/notice-search/agencies";
import { invalidateSearchCache } from "@/lib/services/search-common/sync-events";
import { fullBackfill } from "@/lib/services/search-sync/sync-scheduler";
import { requestIndexRebuild } from "@/lib/services/search-common/rebuild-trigger";

describe("onAgencyAliasesChanged", () => {
  it("先清三级缓存→再宽表全量回填→最后标记 Meili 重建（顺序即正确性）", async () => {
    const pool = {} as unknown as Pool;
    await onAgencyAliasesChanged(pool);
    expect(invalidateAgencyAliasCache).toHaveBeenCalled();
    expect(clearAgenciesCache).toHaveBeenCalled();
    expect(invalidateSearchCache).toHaveBeenCalled();
    // fullBackfill 必须早于 requestIndexRebuild（否则 Meili 读到旧 agency_std）
    expect(vi.mocked(fullBackfill).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(requestIndexRebuild).mock.invocationCallOrder[0]);
  });
});
