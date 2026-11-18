/**
 * 列表行水合只读服务表（2026-11-18 收口）
 *
 * 断言不变量：
 * - 只发一条查询，SQL 不涉及主表 bid_notices（过期清退行不再回退补齐）；
 * - 缺失行被跳过，顺序仍与入参一致（既有承诺不变）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { fetchDetailsByIds } from "@/lib/services/search-orchestrator/detail-fetch";

function makePool(rows: unknown[]) {
  const query = vi.fn(async () => [rows]);
  return { pool: { query } as unknown as Pool, query };
}

const keyOf = (r: Record<string, unknown>) => Number((r.notice_pk ?? r.id) as number);

describe("fetchDetailsByIds 服务表单表水合", () => {
  beforeEach(() => vi.clearAllMocks());

  it("单条查询、不查主表，顺序与入参一致", async () => {
    const rows = [{ notice_pk: 1, title: "A" }, { notice_pk: 2, title: "B" }];
    const { pool, query } = makePool(rows);
    const out = await fetchDetailsByIds(pool, [1, 2], "zh");
    expect(out.map(keyOf)).toEqual([1, 2]);
    expect(query.mock.calls).toHaveLength(1);
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toContain("FROM notice_public p");
    expect(sql).not.toContain("bid_notices");
    expect(sql).not.toContain("notice_deadline");
  });

  it("入参中的缺失行被跳过（不回退主表）", async () => {
    const rows = [{ notice_pk: 2, title: "B" }];
    const { pool } = makePool(rows);
    const out = await fetchDetailsByIds(pool, [1, 2, 3], "zh");
    expect(out.map(keyOf)).toEqual([2]);
  });

  it("空入参不发查询", async () => {
    const { pool, query } = makePool([]);
    expect(await fetchDetailsByIds(pool, [], "zh")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});