/**
 * Meili 索引残留清理条件（D1 回归）
 *
 * 断言不变量：宽表缺行的公告，仅当「主表也不存在」或「主表存在但不满足
 * 平台公告公开可见口径（PLATFORM_PUBLISHED_ONLY）」时才删除索引文档；
 * 主表存在且可见（爬虫行 / 已发布平台行）时不得误删，交由宽表对账修复。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

const deleteDocuments = vi.fn(async () => ({ taskUid: 1 }));
const index = vi.fn(() => ({
  addDocumentsInBatches: vi.fn(async () => []),
  deleteDocuments,
}));

vi.mock("@/lib/services/meilisearch/client", () => ({
  getClient: () => ({ index }),
  isHealthy: () => true,
  getIndexName: () => "notices_test",
}));

import { syncNoticeIds } from "@/lib/services/meilisearch/sync";

/**
 * 按 SQL 内容分派返回批次，不依赖调用次数顺序：
 * syncNoticeIds 用 Promise.all 并发查宽表与主表，按次序桩会把两批行喂反。
 */
function makePool(wide: unknown[][], main: unknown[][]) {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql);
    if (s.includes("crm_notice_search")) return [wide.shift() ?? []];
    return [main.shift() ?? []];
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("syncNoticeIds 索引残留清理", () => {
  beforeEach(() => vi.clearAllMocks());

  it("主表存在但不满足可见口径（platform + closed）→ 删除索引文档", async () => {
    const { pool } = makePool([], [
      [{ id: 5, is_featured: 0, deadline_sec: 0, entry_source: "platform", rfq_status: "closed" }],
    ]);
    const r = await syncNoticeIds(pool, [5]);
    expect(r.deleted).toBe(1);
    expect(deleteDocuments).toHaveBeenCalledWith([5]);
  });

  it("主表存在且已发布（platform + published）而宽表缺行 → 不误删（交对账修复）", async () => {
    const { pool } = makePool([], [
      [{ id: 6, is_featured: 0, deadline_sec: 0, entry_source: "platform", rfq_status: "published" }],
    ]);
    const r = await syncNoticeIds(pool, [6]);
    expect(r.deleted).toBe(0);
    expect(deleteDocuments).not.toHaveBeenCalled();
  });

  it("爬虫行（entry_source=crawl, rfq_status NULL）宽表缺行 → 不误删", async () => {
    const { pool } = makePool([], [
      [{ id: 7, is_featured: 0, deadline_sec: 0, entry_source: "crawl", rfq_status: null }],
    ]);
    expect((await syncNoticeIds(pool, [7])).deleted).toBe(0);
    expect(deleteDocuments).not.toHaveBeenCalled();
  });

  it("主表与宽表都缺行 → 删除索引文档（既有行为保持）", async () => {
    const { pool } = makePool([], [[]]);
    expect((await syncNoticeIds(pool, [8])).deleted).toBe(1);
    expect(deleteDocuments).toHaveBeenCalledWith([8]);
  });

  it("主表查询必须带出 entry_source/rfq_status（可见性判定依赖）", async () => {
    const { pool, query } = makePool([], [[]]);
    await syncNoticeIds(pool, [9]);
    const mainSql = query.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((sql: string) => sql.includes("crm_bid_notices")) ?? "";
    expect(mainSql).toContain("entry_source");
    expect(mainSql).toContain("rfq_status");
  });
});
