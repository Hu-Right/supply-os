/**
 * 宽表对账层清退与存在性对账（2026-11-13 构建时摘除回归）
 *
 * 断言不变量：
 * - reconcileGhostRows 的 ghost 谓词包含稳定过期档（STABLE_EXPIRED_WHERE，30 天余量）；
 * - 删除宽表行后级联清理节点码倒排表（既有行为保持）；
 * - detectWideMissingRows 只检测「服务表有、宽表缺」并返回 id（修复走 syncWideIds）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PIPELINE_EXPIRY_GRACE_SECONDS } from "@/lib/utils/notice-expired";

vi.mock("@/lib/services/search-sync/notice-nodes", () => ({
  deleteNoticeNodes: vi.fn(async () => {}),
}));

import { reconcileGhostRows, detectWideMissingRows } from "@/lib/services/search-sync/wide-row-reconcile";
import { deleteNoticeNodes } from "@/lib/services/search-sync/notice-nodes";

function makePool(rows: unknown[]) {
  const query = vi.fn(async (_sql: string) => [rows as RowDataPacket[]]);
  return { pool: { query } as unknown as Pool, query };
}

describe("宽表 ghost 清退与存在性对账", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reconcileGhostRows 的 ghost 谓词包含稳定过期档与余量常量", async () => {
    const { pool, query } = makePool([]);
    await reconcileGhostRows(pool);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("FROM notice_search ns");
    expect(sql).toContain("OR (n.deadline_sec > 0");
    expect(sql).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
  });

  it("ghost 行删除宽表后级联删节点码（既有行为保持）", async () => {
    const { pool } = makePool([{ id: 7 }, { id: 8 }]);
    const ids = await reconcileGhostRows(pool);
    expect(ids).toEqual([7, 8]);
    expect(vi.mocked(deleteNoticeNodes)).toHaveBeenCalledWith(pool, [7, 8]);
  });

  it("ghost 为空时不产生删除", async () => {
    const { pool } = makePool([]);
    expect(await reconcileGhostRows(pool)).toEqual([]);
    expect(deleteNoticeNodes).not.toHaveBeenCalled();
  });

  it("detectWideMissingRows 返回服务表有而宽表缺的 id", async () => {
    const { pool, query } = makePool([{ id: 101 }, { id: 102 }]);
    expect(await detectWideMissingRows(pool)).toEqual([101, 102]);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("FROM notice_public p");
    expect(sql).toContain("LEFT JOIN notice_search ns");
    expect(sql).toContain("ns.id IS NULL");
  });
});
