/**
 * 索引孤儿清理（pruneOrphanIndexDocs）回归
 *
 * 钉住三条不变量：
 * 1. 只删「服务表 notice_public 已无此行」的索引文档，宽表仍存在的一律保留；
 * 2. 必须先枚举完全部页再统一删——边翻页边删会让 offset 前移，后半段被整段跳过；
 * 3. Meili 不健康时直接跳过，不产生任何删除。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

const health = { ok: true };
const deleteDocuments = vi.fn(async () => ({ taskUid: 1 }));
const getDocuments = vi.fn();

vi.mock("@/lib/services/meilisearch/client", () => ({
  getClient: () => ({ index: () => ({ getDocuments, deleteDocuments }) }),
  isHealthy: () => health.ok,
  getIndexName: () => "notices_test",
  buildNoticeIndexSettings: () => ({}),
}));

import { pruneOrphanIndexDocs } from "@/lib/services/meilisearch/sync";

/** 按顺序吐出索引页；不足 batchSize 的页即视为最后一页（与实现一致） */
function stubIndexPages(pages: number[][]) {
  let i = 0;
  getDocuments.mockImplementation(async () => {
    const ids = pages[i++] ?? [];
    return { results: ids.map((id) => ({ id })), offset: 0, limit: 1000, total: 0 };
  });
}

/** 宽表桩：只回传 live 集合里存在的 id */
function makePool(live: number[]) {
  const set = new Set(live);
  const query = vi.fn(async (_sql: string, params?: unknown[]) => {
    const ids = (params as number[]) ?? [];
    return [ids.filter((id) => set.has(id)).map((id) => ({ notice_pk: id }))];
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("pruneOrphanIndexDocs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    health.ok = true;
  });

  it("只删宽表已不存在的索引文档", async () => {
    stubIndexPages([[1, 2, 3]]);
    const { pool } = makePool([1, 3]);
    const r = await pruneOrphanIndexDocs(pool);
    expect(r).toEqual({ scanned: 3, deleted: 1, orphans: 1 });
    expect(deleteDocuments).toHaveBeenCalledWith([2]);
  });

  it("先枚举完全部页再删除（避免 offset 前移跳行）", async () => {
    stubIndexPages([[1, 2], [3]]);
    const { pool } = makePool([1]);
    const r = await pruneOrphanIndexDocs(pool, { batchSize: 2 });
    expect(r.scanned).toBe(3);
    expect(r.deleted).toBe(2);
    const lastPageCall = getDocuments.mock.invocationCallOrder.at(-1) ?? 0;
    const firstDelete = deleteDocuments.mock.invocationCallOrder[0] ?? 0;
    expect(firstDelete).toBeGreaterThan(lastPageCall);
  });

  it("Meili 不健康 → 跳过，不枚举也不删", async () => {
    health.ok = false;
    stubIndexPages([[1, 2, 3]]);
    const { pool } = makePool([]);
    const r = await pruneOrphanIndexDocs(pool);
    expect(r).toEqual({ scanned: 0, deleted: 0, orphans: 0 });
    expect(getDocuments).not.toHaveBeenCalled();
    expect(deleteDocuments).not.toHaveBeenCalled();
  });
});
