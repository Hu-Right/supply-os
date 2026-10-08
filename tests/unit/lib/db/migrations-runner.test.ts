/**
 * 迁移执行器单元测试（2026-10-08 随迁移机制恢复而补）
 *
 * 覆盖迁移链最容易静默失败的三处：
 * 1) 版本号撞账本已有记录 → runner 会**跳过**而非报错（重写编号时必须知道这个行为）；
 * 2) 拿不到迁移锁 → 必须抛错，不能降级成"跳过迁移继续启动"；
 * 3) 单条迁移失败 → 必须向上抛，不能吞掉后半段。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { runMigrations, type Migration } from "@/lib/db/migrations/runner";
import { ensureProcurementSchema } from "@/lib/db/schema";

interface Captured {
  sql: string;
  params?: unknown[];
}

/** 构造最小 Pool mock：账本内容可注入，所有 SQL 记录下来供断言。 */
function makePool(opts: { applied?: number[]; lockGranted?: boolean } = {}) {
  const calls: Captured[] = [];

  const conn = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("GET_LOCK")) return [[{ got: opts.lockGranted === false ? 0 : 1 }]];
      return [[]];
    },
    release: vi.fn(),
  };

  const pool = {
    getConnection: async () => conn,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT version FROM schema_migrations")) {
        return [(opts.applied ?? []).map((version) => ({ version })) as RowDataPacket[]];
      }
      return [[]];
    },
  };

  return { pool: pool as unknown as Pool, calls };
}

function migration(version: number, ran: number[]): Migration {
  return { version, name: `m${version}`, up: async () => { ran.push(version); } };
}

describe("runMigrations", () => {
  it("空清单：返回 0，除账本表 IF NOT EXISTS 外不产生任何 DDL", async () => {
    const { pool, calls } = makePool();

    await expect(runMigrations(pool, [])).resolves.toBe(0);

    const ddl = calls.filter((c) => /^\s*(ALTER|CREATE|DROP|RENAME)/i.test(c.sql) && !c.sql.includes("schema_migrations"));
    expect(ddl).toEqual([]);
    // 账本表用 IF NOT EXISTS，已存在时为 no-op，不构成结构变更
    expect(calls.some((c) => c.sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations"))).toBe(true);
  });

  it("版本号已在账本 → 静默跳过（重写迁移编号时必须避开已用号）", async () => {
    const ran: number[] = [];
    const { pool } = makePool({ applied: [1, 2, 106] });

    const executed = await runMigrations(pool, [migration(1, ran), migration(2, ran)]);

    expect(executed).toBe(0);
    expect(ran).toEqual([]);
  });

  it("未应用的迁移按版本号升序执行，并逐条记账", async () => {
    const ran: number[] = [];
    const { pool, calls } = makePool({ applied: [] });

    const executed = await runMigrations(pool, [migration(3, ran), migration(1, ran), migration(2, ran)]);

    expect(executed).toBe(3);
    expect(ran).toEqual([1, 2, 3]);
    const recorded = calls.filter((c) => c.sql.includes("INSERT IGNORE INTO schema_migrations"));
    expect(recorded).toHaveLength(3);
    expect(recorded[0]?.params).toEqual([1, "m1"]);
  });

  it("30s 内拿不到迁移锁 → 抛错，不降级为跳过迁移", async () => {
    const { pool } = makePool({ lockGranted: false });

    await expect(runMigrations(pool, [])).rejects.toThrow(/SCHEMA_MIGRATE_LOCK_TIMEOUT/);
  });

  it("单条迁移抛错 → 向上传播，中断后续迁移", async () => {
    const ran: number[] = [];
    const { pool } = makePool();
    const boom: Migration = { version: 1, name: "boom", up: async () => { throw new Error("ddl failed"); } };

    await expect(runMigrations(pool, [boom, migration(2, ran)])).rejects.toThrow("ddl failed");
    expect(ran).toEqual([]);
  });
});

describe("ensureProcurementSchema", () => {
  it("当前 ALL_MIGRATIONS 为空：调用等价于只做账本检查", async () => {
    const { pool } = makePool({ applied: [1, 2, 106] });

    await expect(ensureProcurementSchema(pool)).resolves.toBe(0);
  });
});
