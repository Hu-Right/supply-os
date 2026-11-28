/**
 * 搜索侧下架出口（I3）
 *
 * 2026-11-28 宽表退役：下架不再删宽表行，改为
 * - 委托 syncNoticeIds 删除 Meili 文档（ghost 判定）；
 * - 删节点码倒排表 `notice_search_node`；
 * - 失效搜索缓存。
 *
 * 不变量：
 * - 空入参零调用（防误清空）；
 * - 去重 + 非法 id 过滤 + 分批上限 500，避免超长 IN；
 * - 不再触碰服务表/宽表的任何行（服务表准入由构建决定）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

const syncNoticeIds = vi.fn(async (_pool: unknown, _ids: number[]) => ({ synced: 0, deleted: 0 }));
vi.mock("@/lib/services/meilisearch", () => ({
  syncNoticeIds: (pool: unknown, ids: number[]) => syncNoticeIds(pool, ids),
}));

const invalidateSearchCache = vi.fn();
vi.mock("@/lib/services/search-common/sync-events", () => ({
  invalidateSearchCache: () => invalidateSearchCache(),
}));

const deleteNoticeNodes = vi.fn(async (_pool: unknown, _ids: number[]) => 0);
vi.mock("@/lib/services/search-sync/notice-nodes", () => ({
  deleteNoticeNodes: (pool: unknown, ids: number[]) => deleteNoticeNodes(pool, ids),
}));

import { purgeNoticeSearch } from "@/lib/services/search-visibility/purge";

function makePool() {
  const query = vi.fn(async () => [{ affectedRows: 1 }]);
  return { pool: { query } as unknown as Pool, query };
}

describe("purgeNoticeSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("空数组：不发任何调用，不动缓存", async () => {
    const { pool, query } = makePool();
    expect(await purgeNoticeSearch(pool, [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(syncNoticeIds).not.toHaveBeenCalled();
    expect(invalidateSearchCache).not.toHaveBeenCalled();
    expect(deleteNoticeNodes).not.toHaveBeenCalled();
  });

  it("单个 id：级联删 Meili 文档 + 节点码倒排 + 失效缓存，不删 DB 行", async () => {
    const { pool, query } = makePool();
    expect(await purgeNoticeSearch(pool, [42])).toBe(1);
    expect(query).not.toHaveBeenCalled();
    expect(syncNoticeIds).toHaveBeenCalledWith(pool, [42]);
    expect(deleteNoticeNodes).toHaveBeenCalledWith(pool, [42]);
    expect(invalidateSearchCache).toHaveBeenCalledTimes(1);
  });

  it("去重 + 过滤非法 id + 分批（600 个 → 2 批）", async () => {
    const { pool } = makePool();
    const ids = Array.from({ length: 600 }, (_, i) => i + 1);
    expect(await purgeNoticeSearch(pool, [...ids, 1, 2, Number.NaN, -3, 0])).toBe(600);
    expect(syncNoticeIds).toHaveBeenCalledTimes(2);
  });
});
