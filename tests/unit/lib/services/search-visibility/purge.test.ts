/**
 * 平台公告可见性清除出口（I3）
 *
 * 不变量：
 * - 先删宽表行，再委托 syncNoticeIds 联动删除 Meili 文档与失效搜索缓存；
 * - 空入参零 SQL 调用（防误清空）；
 * - 去重 + 非法 id 过滤 + 分批上限 500，避免超长 IN。
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

// 节点码倒排表的级联删除：本文件守的是「purge 必须级联」这条合同，而不是
// notice-nodes 内部的实现（它自己另有 23 条单测）。不 mock 的话本文件的
// query 调用次数断言会跟着它的「表存在性缓存」走，用例之间隐性耦合。
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

  it("空数组：不发任何 SQL，不动缓存", async () => {
    const { pool, query } = makePool();
    expect(await purgeNoticeSearch(pool, [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(syncNoticeIds).not.toHaveBeenCalled();
    expect(invalidateSearchCache).not.toHaveBeenCalled();
    expect(deleteNoticeNodes).not.toHaveBeenCalled();
  });

  it("单个 id：删宽表行 + 级联 Meili + 失效缓存，返回受影响行数", async () => {
    const { pool, query } = makePool();
    expect(await purgeNoticeSearch(pool, [42])).toBe(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM notice_search WHERE id IN (?)"),
      [42],
    );
    // 桥表跟删：宽表行没了而节点码还挂着 = 从倒排方向能查出一条不存在的公告
    expect(deleteNoticeNodes).toHaveBeenCalledWith(pool, [42]);
    expect(syncNoticeIds).toHaveBeenCalledWith(pool, [42]);
    expect(invalidateSearchCache).toHaveBeenCalledTimes(1);
  });

  it("去重 + 过滤非法 id + 分批（600 个 → 2 批）", async () => {
    const { pool, query } = makePool();
    const ids = Array.from({ length: 600 }, (_, i) => i + 1);
    await purgeNoticeSearch(pool, [...ids, 1, 2, Number.NaN, -3, 0]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(syncNoticeIds).toHaveBeenCalledTimes(2);
  });
});
