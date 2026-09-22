/**
 * 迁移 087 行为契约：
 * - Step 0 先删除宽表 FULLTEXT 死索引（否则 InnoDB 拒绝 INSTANT 加列），且必须在线安全
 * - 指纹列加列前先探测 INFORMATION_SCHEMA（幂等，重复执行安全）
 * - 加列必须 ALGORITHM=INSTANT + 短 lock_wait_timeout（不允许时报错而非静默降级持锁）
 * - 存量纠偏全部分批（LIMIT 批次循环），不得对 46 万行表发无界 UPDATE
 * - 不触碰 crm_bid_notices 的列/索引结构（重活留停服窗口，见 spec I4 步骤 B）
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

import { migration } from "@/lib/db/migrations/087-wide-table-sync-fingerprint";

function makePool(opts: {
  columnExists?: boolean;
  affected?: number[];
  alterThrows?: string;
  fulltextIndexes?: string[];
} = {}) {
  const calls: Array<{ sql: string; params?: unknown }> = [];
  const affected = opts.affected ?? [0];
  let updateIdx = 0;
  const query = vi.fn(async (sql: string, params?: unknown) => {
    const s = String(sql);
    calls.push({ sql: s, params });
    // 两条探测查询必须分开返回：STATISTICS 给索引名，COLUMNS 给存在性
    if (/INDEX_TYPE = 'FULLTEXT'/i.test(s)) {
      return [(opts.fulltextIndexes ?? ["ft_search_en"]).map((n) => ({ INDEX_NAME: n }))];
    }
    if (/INFORMATION_SCHEMA/i.test(s)) {
      return [[{ total: opts.columnExists ? 1 : 0 }]];
    }
    // 只让加列语句失败（DROP 索引也以 ALTER TABLE 开头，不能误伤）
    if (/ADD COLUMN/i.test(s) && opts.alterThrows) throw new Error(opts.alterThrows);
    if (/^\s*UPDATE/i.test(s)) {
      return [{ affectedRows: affected[Math.min(updateIdx++, affected.length - 1)] ?? 0 }];
    }
    return [{}];
  });
  return { pool: { query } as unknown as Pool, calls };
}

describe("migration 087", () => {
  it("版本号与名称", () => {
    expect(migration.version).toBe(87);
    expect(migration.name).toBe("wide-table-sync-fingerprint");
  });

  it("先探测 sync_src_hash 是否已存在（幂等前置）", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const probe = calls.find((c) => /INFORMATION_SCHEMA\.COLUMNS/i.test(c.sql));
    expect(probe?.sql).toContain("sync_src_hash");
    expect(probe?.sql).toContain("crm_notice_search");
  });

  it("列已存在时不再发 ADD COLUMN（重复执行零副作用）", async () => {
    const { pool, calls } = makePool({ columnExists: true, fulltextIndexes: [] });
    await migration.up(pool);
    expect(calls.map((c) => c.sql).join("\n")).not.toMatch(/ADD COLUMN/i);
  });

  it("列不存在时加列为 CHAR(32) NOT NULL DEFAULT ''，并强制 ALGORITHM=INSTANT", async () => {
    const { pool, calls } = makePool({ columnExists: false });
    await migration.up(pool);
    // 必须锁定加列那一条（DROP 索引同为 `ALTER TABLE crm_notice_search` 开头）
    const alter = calls.find((c) => /ADD COLUMN sync_src_hash/i.test(c.sql));
    expect(alter?.sql).toMatch(/sync_src_hash\s+CHAR\(32\)\s+NOT NULL\s+DEFAULT ''/i);
    // 静默退化为 copy to tmp table 会持锁数十分钟并阻塞应用宽表写入（现网实测）
    expect(alter?.sql).toMatch(/ALGORITHM\s*=\s*INSTANT/i);
    /**
     * 回归护栏：ALGORITHM 是 alter_option 列表项，与前一子句之间缺逗号会直接
     * syntax error（MySQL 8.0.46 实测），而本迁移处于启动必跑的 schemaPhase，
     * 一条逗号就能让整个服务起不来。
     */
    expect(alter?.sql.replace(/\s+/g, " ")).toMatch(/'\s*,\s*ALGORITHM=INSTANT\s*$/i);
    expect(alter?.sql).not.toMatch(/'\s+ALGORITHM=/i);
    // 同会话内限定元数据锁等待，不把在线查询堆在队列里
    expect(calls.some((c) => /lock_wait_timeout/i.test(c.sql))).toBe(true);
  });

  it("无法 INSTANT 时报错并给出停服指引，绝不静默降级重跑", async () => {
    const { pool } = makePool({ columnExists: false, alterThrows: "ALGORITHM=INSTANT is not supported" });
    await expect(migration.up(pool)).rejects.toThrow(/停服窗口/);
  });

  it("所有 UPDATE 均带 LIMIT（分批，禁止无界更新）", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const updates = calls.filter((c) => /UPDATE\s+crm_notice_search/i.test(c.sql));
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(u.sql).toMatch(/LIMIT\s+\d+/i);
  });

  it("先删宽表 FULLTEXT 死索引，再加列（顺序颠倒会被 InnoDB 拒绝 INSTANT）", async () => {
    const { pool, calls } = makePool({ fulltextIndexes: ["ft_search_en"] });
    await migration.up(pool);
    const sqls = calls.map((c) => c.sql);
    const dropAt = sqls.findIndex((s) => /DROP INDEX ft_search_en/i.test(s));
    const addAt = sqls.findIndex((s) => /ADD COLUMN sync_src_hash/i.test(s));
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(dropAt);
    // 删索引必须在线：INPLACE + 允许并发 DML
    expect(sqls[dropAt]).toMatch(/ALGORITHM\s*=\s*INPLACE/i);
    expect(sqls[dropAt]).toMatch(/LOCK\s*=\s*NONE/i);
  });

  it("无 FULLTEXT 索引时不发任何 DROP（幂等，不伤存量库）", async () => {
    const { pool, calls } = makePool({ fulltextIndexes: [] });
    await migration.up(pool);
    expect(calls.map((c) => c.sql).join("\n")).not.toMatch(/DROP INDEX/i);
  });

  it("索引名不在白名单内时拒绝拼 DDL（防注入）", async () => {
    const { pool } = makePool({ fulltextIndexes: ["a; DROP TABLE x --"] });
    await expect(migration.up(pool)).rejects.toThrow(/非法索引名/);
  });

  it("不修改 crm_bid_notices 结构（无 ALTER TABLE crm_bid_notices）", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    expect(calls.map((c) => c.sql).join("\n")).not.toMatch(/ALTER\s+TABLE\s+crm_bid_notices/i);
  });

  it("脏 precise_levelN 清理只命中含非数字字符的行", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const clean = calls.find((c) => /precise_level1/.test(c.sql) && /REGEXP/i.test(c.sql));
    expect(clean?.sql).toContain("[^0-9,]");
  });

  it("平台编号补齐使用 OSRFQ- 前缀 + 12 位补零（与 create 路由一致）", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const ref = calls.find((c) => /OSRFQ-/.test(c.sql));
    expect(ref?.sql).toContain("LPAD(id, 12, '0')");
    expect(ref?.sql).toContain("entry_source = 'platform'");
  });
});
