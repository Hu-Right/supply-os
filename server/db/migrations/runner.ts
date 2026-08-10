/**
 * Schema 迁移运行器
 * Schema migration runner with version tracking
 *
 * @module server/db/migrations/runner
 * @description 按版本号顺序执行迁移，已执行的迁移跳过（幂等安全）。
 *              使用 schema_migrations 表追踪已应用的迁移版本。
 *              所有 DDL 本身已幂等（CREATE TABLE IF NOT EXISTS / ensureColumn），
 *              本运行器额外提供版本追踪，避免重复执行日志噪音。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface Migration {
  version: number;
  name: string;
  up: (dbPool: Pool) => Promise<void>;
}

/** 确保迁移追踪表存在 */
async function ensureMigrationsTable(dbPool: Pool): Promise<void> {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT UNSIGNED NOT NULL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** 获取已应用的迁移版本号集合 */
async function getAppliedVersions(dbPool: Pool): Promise<Set<number>> {
  const [rows] = await dbPool.query(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  return new Set((rows as RowDataPacket[]).map((r) => Number(r.version)));
}

/** 记录迁移已应用 */
async function recordMigration(dbPool: Pool, version: number, name: string): Promise<void> {
  await dbPool.query(
    "INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)",
    [version, name],
  );
}

/**
 * 运行所有待执行的迁移
 * @returns 本次执行的迁移数量
 */
export async function runMigrations(dbPool: Pool, migrations: Migration[]): Promise<number> {
  await ensureMigrationsTable(dbPool);
  const applied = await getAppliedVersions(dbPool);

  // 按版本号排序
  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return 0;

  for (const migration of pending) {
    const tag = `[migration ${String(migration.version).padStart(3, "0")}: ${migration.name}]`;
    try {
      console.log(`${tag} 开始执行…`);
      await migration.up(dbPool);
      await recordMigration(dbPool, migration.version, migration.name);
      console.log(`${tag} 完成`);
    } catch (err) {
      console.error(`${tag} 失败:`, (err as Error).message);
      throw err;
    }
  }

  return pending.length;
}

// ── DDL 工具函数（供迁移文件使用）──

export async function ensureColumn(dbPool: Pool, table: string, column: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) === 0) {
    await dbPool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export async function ensureColumnType(dbPool: Pool, table: string, column: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if ((rows as RowDataPacket[]).length > 0) {
    await dbPool.query(`ALTER TABLE ${table} MODIFY COLUMN ${ddl}`);
  }
}

export async function ensureIndex(dbPool: Pool, table: string, indexName: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) === 0) {
    await dbPool.query(ddl);
  }
}

export async function ensureIndexIfTableExists(dbPool: Pool, table: string, indexName: string, ddl: string) {
  const [tableRows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  if (Number((tableRows as RowDataPacket[])[0]?.total || 0) === 0) return;
  await ensureIndex(dbPool, table, indexName, ddl);
}
