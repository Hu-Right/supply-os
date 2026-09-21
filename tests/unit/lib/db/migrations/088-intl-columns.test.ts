/**
 * 迁移 088 行为契约：
 * - 加列前先一次性探测 17 列存在性（幂等，重复执行零副作用）
 * - 全部缺失列**合并为一条 ALTER**：每条 ADD COLUMN 语句各消耗一个 InnoDB 行版本
 *   （表 TOTAL_ROW_VERSIONS 上限 64，当前 5），逐列 ALTER 会白烧 17 个版本
 * - 必须 ALGORITHM=INSTANT 且与前一子句之间有逗号（缺逗号即语法错误，服务起不来）
 * - 必须先 SET lock_wait_timeout（拿不到 MDL 要快速失败，不把在线查询堆进队列）
 * - 不允许静默降级：INSTANT 失败必须抛错并保留原始 cause
 * - 绝不触碰 crm_notice_search / crm_bid_notices 的结构（实测二者 INSTANT 均不可用）
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

import { migration } from "@/lib/db/migrations/088-opportunity-intl-procurement-columns";

/** 已存在的列名集合（模拟 INFORMATION_SCHEMA 探测结果） */
function makePool(opts: { existing?: string[]; alterThrows?: string } = {}) {
  const calls: Array<{ sql: string; params?: unknown }> = [];
  const existing = new Set(opts.existing ?? []);
  const query = vi.fn(async (sql: string, params?: unknown) => {
    const s = String(sql);
    calls.push({ sql: s, params });
    if (/INFORMATION_SCHEMA\.COLUMNS/i.test(s)) {
      const names = ((params as unknown[]) || []).slice(1) as string[];
      return [names.filter((n) => existing.has(n)).map((n) => ({ COLUMN_NAME: n }))];
    }
    if (/^\s*ALTER TABLE/i.test(s) && opts.alterThrows) throw new Error(opts.alterThrows);
    return [{}];
  });
  return { pool: { query } as unknown as Pool, calls };
}

const ALL_COLUMNS = [
  "procurement_procedure", "prequalification_required", "lot_structure", "contract_form",
  "consortium_rule", "bid_validity_days", "submission_mode", "submission_requirement",
  "submission_address", "funding_agency", "evaluation_method", "language_requirement",
  "execution_period", "local_content", "eshs_requirements", "eligible_countries", "key_dates",
];

const alterCalls = (calls: Array<{ sql: string }>) =>
  calls.filter((c) => /^\s*ALTER TABLE/i.test(c.sql));

describe("migration 088 · 机会表国际采购结构化列", () => {
  it("版本号与名称", () => {
    expect(migration.version).toBe(88);
    expect(migration.name).toBe("intl-procurement-columns");
  });

  it("一次探测覆盖全部 17 列，且只针对机会表", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const probe = calls.filter((c) => /INFORMATION_SCHEMA\.COLUMNS/i.test(c.sql));
    expect(probe).toHaveLength(1);
    const params = probe[0].params as unknown[];
    expect(params[0]).toBe("crm_bid_opportunities");
    expect(params.slice(1).sort()).toEqual([...ALL_COLUMNS].sort());
  });

  it("全部列已存在时不发任何 ALTER（重复执行零副作用）", async () => {
    const { pool, calls } = makePool({ existing: ALL_COLUMNS });
    await migration.up(pool);
    expect(alterCalls(calls)).toHaveLength(0);
  });

  it("缺失列合并为一条 ALTER，17 个 ADD COLUMN 子句", async () => {
    const { pool, calls } = makePool({ existing: ["lot_structure"] });
    await migration.up(pool);
    const alters = alterCalls(calls);
    expect(alters).toHaveLength(1);
    const sql = alters[0].sql;
    expect((sql.match(/ADD COLUMN/gi) || [])).toHaveLength(ALL_COLUMNS.length - 1);
    expect(sql).not.toMatch(/lot_structure/); // 已存在列不重复加
    expect(sql).toMatch(/procurement_procedure\s+VARCHAR\(60\)/i);
    expect(sql).toMatch(/bid_validity_days\s+SMALLINT UNSIGNED/i);
    expect(sql).toMatch(/key_dates\s+TEXT/i);
  });

  it("钉死 ALGORITHM=INSTANT，且与前一子句之间有逗号（缺逗号即语法错误）", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const sql = alterCalls(calls)[0].sql;
    expect(sql).toMatch(/ALGORITHM\s*=\s*INSTANT\s*$/i);
    // ALGORITHM 之前必须是逗号结尾（087 曾因此让服务起不来）
    const before = sql.slice(0, sql.toUpperCase().indexOf("ALGORITHM")).trimEnd();
    expect(before.endsWith(",")).toBe(true);
    // 一个版本预算：只允许一条 ALTER，不得逐列发 17 条
    expect(alterCalls(calls)).toHaveLength(1);
  });

  it("加列前设置短 lock_wait_timeout，避免把在线查询堆进 MDL 队列", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const idx = calls.findIndex((c) => /SET SESSION lock_wait_timeout/i.test(c.sql));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(calls.findIndex((c) => /^\s*ALTER TABLE/i.test(c.sql))).toBeGreaterThan(idx);
  });

  it("INSTANT 不被支持时抛错、不降级，并保留原始 cause", async () => {
    const { pool } = makePool({ alterThrows: "ALGORITHM=INSTANT is not supported for this operation" });
    await expect(migration.up(pool)).rejects.toThrow(/未能以 ALGORITHM=INSTANT 完成/);
    await expect(migration.up(pool)).rejects.toThrow(/停服窗口/);
    try {
      await migration.up(pool);
    } catch (err) {
      expect((err as { cause?: Error }).cause?.message).toMatch(/not supported for this operation/);
    }
  });

  it("绝不对宽表与公告主表发 ALTER（实测两表 INSTANT 均不可用）", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const sql = calls.map((c) => c.sql).join("\n");
    expect(sql).not.toMatch(/ALTER TABLE\s+crm_notice_search/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+crm_bid_notices/i);
  });
});
