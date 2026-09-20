/**
 * 平台公告状态漂移对账（D2 回归）
 *
 * 不变量：
 * - 检测只读：对账函数不得对宽表发任何 UPDATE/DELETE（I1）；
 * - 输出拆成 toSync（应可见但宽表缺行）与 toPurge（不可见但宽表有行）两路；
 * - published 判定复用 RFQ_STATUS 常量，不接受裸字符串。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { detectPlatformStatusDrift } from "@/lib/services/search-sync/wide-row-reconcile";

function makePool(rows: unknown[][]) {
  // 入参带类型标注，否则 vi.fn 推为零参签名，无法断言 mock.calls 里的 SQL
  const query = vi.fn(async (_sql: string) => [rows.shift() ?? []]);
  return { pool: { query } as unknown as Pool, query };
}

describe("detectPlatformStatusDrift", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回 toSync/toPurge 两路 id，且只发一条 SELECT", async () => {
    const { pool, query } = makePool([
      [
        { id: 11, wide_id: null }, // 已发布但宽表缺行
        { id: 12, wide_id: 12 },   // 非发布但宽表有行
      ],
    ]);
    const r = await detectPlatformStatusDrift(pool);
    expect(r.toSync).toEqual([11]);
    expect(r.toPurge).toEqual([12]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("SQL 形状：按 entry_source='platform' 走 idx_entry_source，且不出现 UPDATE/DELETE crm_notice_search", async () => {
    const { pool, query } = makePool([[]]);
    await detectPlatformStatusDrift(pool);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("n.entry_source = 'platform'");
    // 枚举值经 JSON.stringify 注入（双引号），断言容忍两种引号风格
    expect(sql).toMatch(/IFNULL\(n\.rfq_status,\s*''\)\s*=\s*["']published["']/);
    expect(sql).not.toMatch(/UPDATE\s+crm_notice_search/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+crm_notice_search/i);
  });

  it("无漂移 → 两个空数组", async () => {
    const { pool } = makePool([[]]);
    expect(await detectPlatformStatusDrift(pool)).toEqual({ toSync: [], toPurge: [] });
  });
});
