/**
 * 把「由 `db/schema/baseline.sql` 建出来的库」标成终态账本
 *
 * @module scripts/tools/seed-schema-ledger
 * @description 为什么需要它（2026-11-16 CI e2e 事故）：
 *              `baseline.sql` 是现网**终态**结构，而 `ALL_MIGRATIONS` 是「旧库 → 终态」的
 *              一次性迁移，两者不是同一条演化路径。基线建出来的库结构已经是最新的，但
 *              `schema_migrations` 是空的（基线只收 DDL、不收数据），于是 instrumentation 的
 *              `schemaPhase` 把这 29 个迁移全部当成 pending 重放。其中 012 只对旧结构成立
 *              （引用早已改名/下线的 `buyer.org_type`），在基线上直接
 *              `Unknown column 'b.org_type' in 'field list'` → `abortStartup` 走 exit(1) →
 *              端口从未监听 → CI e2e 的 120s 探活闸口报「应用在 120s 内未就绪」，
 *              且 `next start` 日志里只剩一句与真实原因无关的「数据库服务未运行」猜测。
 *
 *              本脚本把 `ALL_MIGRATIONS` 的全部版本写进 `schema_migrations`，让 `schemaPhase`
 *              回到设计路径：账本已是终态 → 只做账本检查、不产生任何 DDL。
 *
 * 用法：
 *              本地（读 .env）：`npm run db:seed-ledger`
 *              CI（DB_* 来自 job env）：`npx tsx scripts/tools/seed-schema-ledger.ts`
 *
 * 前置：目标库必须**已导入** `db/schema/*.sql`。脚本会逐表核对基线里的表是否都在目标库，
 *      缺表直接失败——否则会在空库/错库上把账本“补”成已应用，让后续真实迁移被静默跳过。
 *      不 import `lib/db/pool`（`server-only` 模块，仅 Next 打包环境可用），与
 *      `scripts/tools/apply-migrations.ts` 同一口径。
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql2 from "mysql2/promise";
import { ALL_MIGRATIONS } from "../../src/lib/db/schema";

const SCHEMA_DIR = join(process.cwd(), "db", "schema");

/** 从 db/schema/*.sql 抽出所有 `CREATE TABLE \`x\`` 的表名（基线的结构清单） */
async function readBaselineTables(): Promise<string[]> {
  const files = (await readdir(SCHEMA_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    throw new Error(`缺少 db/schema/*.sql 结构基线：${SCHEMA_DIR} 下没有任何 .sql，无法核对目标库`);
  }
  const tables = new Set<string>();
  for (const f of files) {
    const sql = await readFile(join(SCHEMA_DIR, f), "utf8");
    for (const m of sql.matchAll(/CREATE TABLE `([^`]+)`/g)) tables.add(m[1]);
  }
  return [...tables].sort();
}

async function main() {
  const dbName = process.env.DB_NAME || "crm";
  const pool = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: dbName,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 2,
  });

  const target = `${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 3306}/${dbName}`;
  console.log(`[seed-ledger] target ${target}, migrations ${ALL_MIGRATIONS.length}`);

  // ── 前置校验：基线里的表必须都在目标库 ──
  const baselineTables = await readBaselineTables();
  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  const present = new Set((tableRows as Array<{ name: string }>).map((r) => r.name));
  const missing = baselineTables.filter((t) => !present.has(t));
  if (missing.length > 0) {
    await pool.end();
    throw new Error(
      `目标库 ${dbName} 缺少基线中的 ${missing.length} 张表（如 ${missing.slice(0, 5).join(", ")}）。\n` +
        `          账本只能在「已导入 db/schema/*.sql」的库上补，先导入基线再执行本脚本。`,
    );
  }

  // ── 账本表：与 runner 中 ensureMigrationsTable 完全同构 ──
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INT UNSIGNED NOT NULL PRIMARY KEY, name VARCHAR(120) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  );

  const [appliedRows] = await pool.query("SELECT version FROM schema_migrations");
  const applied = new Set((appliedRows as Array<{ version: number }>).map((r) => Number(r.version)));

  const pending = ALL_MIGRATIONS.filter((m) => !applied.has(m.version));
  for (const m of pending) {
    await pool.query("INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)", [
      m.version,
      m.name,
    ]);
  }

  console.log(
    `[seed-ledger] 基线 ${baselineTables.length} 张表齐备；账本补录 ${pending.length} 条` +
      `（原已存在 ${applied.size} 条），终态 ${ALL_MIGRATIONS.length} 条`,
  );
  if (pending.length > 0) {
    console.log(
      `[seed-ledger] 版本：${pending.map((m) => String(m.version).padStart(3, "0")).join(" ")}`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[seed-ledger] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
