/**
 * R3' B3：兴趣码持久化断掉 UNSPSC 字典
 *
 * 判据出处：specs §4 第 4 行「兴趣码停写 code_id（实测 MAX(code_id) 投影下游无使用者）」。
 * 现有 tests/unit/lib/services/opportunity-unlock.test.ts 只是 vi.mock 掉本模块，
 * 没有任何用例钉住它发什么 SQL ⇒ 「不再查字典」这条判据此前无测试保护，本文件补上。
 *
 * 为什么停写 code_id 是安全的（实测，不是推断）：
 *   crm_user_interest_codes 的唯一键是 uk_user_code_source(user_id, code, source)，
 *   **不含 code_id** ⇒ 去掉该列不改变 ON DUPLICATE KEY UPDATE 的去重语义（权重不会开始重复累加）；
 *   且 code_id 本身 IS_NULLABLE=YES / 默认 NULL，现网 830 行、NULL 0 行。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { persistUserInterestCodes } from "@/lib/services/unspsc/interest";

/** 记录每一条发出去的 SQL 与参数，用来断言「字典查询根本没发生」 */
function fakePool() {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ sql: String(sql), args });
      return [[]];
    }),
    execute: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ sql: String(sql), args });
      return [{ affectedRows: 1 }];
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

const SNAPSHOT = [
  { code: "43230000", name: "实验室设备" },
  { code: "48151501", name: "计算机" },
];

describe("persistUserInterestCodes — 字典依赖已摘", () => {
  it("全程不对 crm_unspsc_codes 发查询（B3 核心判据）", async () => {
    const { pool, calls } = fakePool();
    await persistUserInterestCodes(pool, 7, SNAPSHOT, "unlock_order", 2.5);
    const hit = calls.filter((c) => c.sql.includes("crm_unspsc_codes"));
    expect(hit.map((c) => c.sql)).toEqual([]);
  });

  it("INSERT 不再带 code_id 列，其余形制（code/level/source/weight）不变", async () => {
    const { pool, calls } = fakePool();
    await persistUserInterestCodes(pool, 7, SNAPSHOT, "unlock_order", 2.5);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO crm_user_interest_codes"));
    expect(insert).toBeTruthy();
    expect(insert!.sql).not.toContain("code_id");
    expect(insert!.sql).toContain("ON DUPLICATE KEY UPDATE");
    // 列清单与实参数一一对上：少了 code_id 就少一个占位
    const cols = insert!.sql.match(/\(([^)]*)\)/)![1];
    expect(cols).toBe("user_id, code, level, source, weight");
    expect(insert!.args).toHaveLength(5);
  });

  it("前缀展开仍按原形制写 code 与 level（改吃节点码属 R4'，本批不动）", async () => {
    const { pool, calls } = fakePool();
    await persistUserInterestCodes(pool, 7, [{ code: "43230000" }], "express_interest", 1);
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO crm_user_interest_codes"));
    // 43230000 → 有效前缀 4323（尾部 00 段去掉）→ 展开 43、4323
    expect(inserts.map((c) => c.args[1])).toEqual(["43", "4323"]);
    expect(inserts.map((c) => c.args[2])).toEqual([1, 2]);
  });

  it("白名单外来源仍然拒写（改造没把闸门带松）", async () => {
    const { pool, calls } = fakePool();
    await persistUserInterestCodes(pool, 7, SNAPSHOT, "crawler_auto", 9);
    expect(calls).toEqual([]);
  });

  it("权重软上限 LEAST 仍在 SQL 里（只封新增的口径没丢）", async () => {
    const { pool, calls } = fakePool();
    await persistUserInterestCodes(pool, 7, [{ code: "43230000" }], "feedback_click", 0.3);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO crm_user_interest_codes"));
    expect(insert!.sql).toContain("LEAST(");
  });
});
