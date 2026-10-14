/**
 * 用户兴趣节点持久化（UGT 版）— SQL 契约测试
 *
 * 小表剥离（2026-10-14）后钉住三件事：
 * 1. **字典依赖保持摘除**（承接 R3' B3 的判据）：全程不对 旧品类字典表 发查询；
 * 2. **code 存 UGT 节点码**：INSERT 形制 (user_id, code, level, source, weight)，
 *    level 由码长现算（码长即层级），ODKU 权重封顶沿用；
 * 3. **来源白名单与形制闸**：白名单外来源拒写、非法码不落列。
 * 取代已删的 tests/unit/lib/services/旧品类码/interest.test.ts（旧版测数字前缀展开）。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import {
  persistInterestNodeCodes,
  decayInterestNodeCodes,
  loadNoticeNodeCodes,
} from "@/lib/services/commodity/interest";

/** 记录每一条发出去的 SQL 与参数，用来断言「字典查询根本没发生」 */
function fakePool(queryRows: Array<Record<string, unknown>> = []) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ sql: String(sql), args });
      return [queryRows];
    }),
    execute: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ sql: String(sql), args });
      return [{ affectedRows: 1 }];
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

describe("persistInterestNodeCodes — 码源已切 UGT 节点码", () => {
  it("全程不对 crm_unspsc_codes 发查询（承接 B3 判据）", async () => {
    const { pool, calls } = fakePool();
    await persistInterestNodeCodes(pool, 7, ["UGT-0101010101", "UGT-0101"], "unlock_order", 2.5);
    expect(calls.filter((c) => c.sql.includes("crm_unspsc_codes"))).toEqual([]);
  });

  it("INSERT 形制 (user_id, code, level, source, weight)：level 由码长现算，ODKU 封顶沿用", async () => {
    const { pool, calls } = fakePool();
    await persistInterestNodeCodes(pool, 7, ["UGT-0101010101"], "unlock_order", 2.5);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO crm_user_interest_codes"));
    expect(insert).toBeTruthy();
    expect(insert!.sql).not.toContain("code_id");
    expect(insert!.sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(insert!.sql).toContain("LEAST(500");
    const cols = insert!.sql.match(/\(([^)]*)\)/)![1];
    expect(cols).toBe("user_id, code, level, source, weight");
    // [userId, code, level(码长即层级), source, weight]
    expect(insert!.args).toEqual([7, "UGT-0101010101", 5, "unlock_order", 2.5]);
  });

  it("白名单外来源拒写；非法码（数字旧码/乱串）不落列；同码去重", async () => {
    const { pool, calls } = fakePool();
    await persistInterestNodeCodes(pool, 7, ["43211600", "UGT-XX", "UGT-0101", "UGT-0101"], "unknown_source", 2.5);
    expect(calls).toHaveLength(0); // 白名单外一条不发

    await persistInterestNodeCodes(pool, 7, ["43211600", "UGT-XX", "UGT-0101", "UGT-0101"], "unlock_order", 2.5);
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO crm_user_interest_codes"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args![1]).toBe("UGT-0101");
  });
});

describe("decayInterestNodeCodes / loadNoticeNodeCodes", () => {
  it("衰减按 UGT 键精确 UPDATE，非法码不入列表", async () => {
    const { pool, calls } = fakePool();
    await decayInterestNodeCodes(pool, 7, ["UGT-0101", "43211600"], 0.95);
    const update = calls.find((c) => c.sql.includes("UPDATE crm_user_interest_codes"));
    expect(update).toBeTruthy();
    expect(update!.args).toEqual([0.95, 7, "UGT-0101"]);
  });

  it("loadNoticeNodeCodes 读倒排表并按公告分组", async () => {
    const { pool, calls } = fakePool([
      { notice_id: 11, node: "UGT-01" },
      { notice_id: 11, node: "UGT-0101" },
      { notice_id: 12, node: "UGT-4301" },
    ]);
    const map = await loadNoticeNodeCodes(pool, [11, 12]);
    expect(calls[0].sql).toContain("crm_notice_backbone_nodes");
    expect(map.get(11)).toEqual(["UGT-01", "UGT-0101"]);
    expect(map.get(12)).toEqual(["UGT-4301"]);
  });

  it("空入参一条 SQL 都不发", async () => {
    const { pool, calls } = fakePool();
    await loadNoticeNodeCodes(pool, []);
    expect(calls).toHaveLength(0);
  });
});
