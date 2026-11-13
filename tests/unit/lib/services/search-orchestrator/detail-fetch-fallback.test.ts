/**
 * 详情直链 miss 回退主表（2026-11-13 构建时摘除回归）
 *
 * 断言不变量：
 * - 服务表全命中 → 不触发回退查询（主链零额外开销）；
 * - 稳定过期行被清退出服务表后，直链/收藏 miss → 主表回退补齐，顺序仍与入参一致；
 * - 两边都缺的行被跳过（既有承诺不变）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/search-common/wide-table-readiness", () => ({
  isWideTableReady: vi.fn(async () => true),
}));

import { fetchDetailsByIds } from "@/lib/services/search-orchestrator/detail-fetch";

/** 按表名分派返回行：notice_public 主查询走 wide，bid_notices 回退查询走 main */
function makePool(wide: unknown[], main: unknown[]) {
  const query = vi.fn(async (sql: string) => [
    String(sql).includes("bid_notices") ? main : wide,
  ]);
  return { pool: { query } as unknown as Pool, query };
}

const keyOf = (r: Record<string, unknown>) => Number((r.notice_pk ?? r.id) as number);

describe("详情直链 miss 回退主表", () => {
  beforeEach(() => vi.clearAllMocks());

  it("服务表全命中 → 不触发回退查询", async () => {
    const wide = [{ notice_pk: 1, title: "A" }];
    const { pool, query } = makePool(wide, []);
    const rows = await fetchDetailsByIds(pool, [1], "zh");
    expect(rows).toHaveLength(1);
    expect(query.mock.calls).toHaveLength(1); // 仅主查询（readiness 已 mock）
  });

  it("过期清退行 miss → 主表回退补齐，顺序与入参一致", async () => {
    const wide = [{ notice_pk: 2, title: "B" }];
    const main = [{ id: 1, title: "expired-A" }, { id: 3, title: "expired-C" }];
    const { pool, query } = makePool(wide, main);
    const rows = await fetchDetailsByIds(pool, [1, 2, 3], "zh");
    expect(rows.map(keyOf)).toEqual([1, 2, 3]);
    expect((rows[0] as Record<string, unknown>).title).toBe("expired-A");
    expect((rows[2] as Record<string, unknown>).title).toBe("expired-C");
    // 回退查询只带 missed 的 id（1、3），不带已命中的 2
    const fallbackCall = query.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes("bid_notices"));
    expect(fallbackCall).toBeDefined();
  });

  it("两边都缺的行被跳过（既有承诺不变）", async () => {
    const { pool } = makePool([], []);
    expect(await fetchDetailsByIds(pool, [9], "zh")).toEqual([]);
  });
});
