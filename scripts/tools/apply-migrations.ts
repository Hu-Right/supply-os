/**
 * 离线应用 schema 迁移（等价于启动时的 schemaPhase）
 *
 * @module scripts/tools/apply-migrations
 * @description 为什么需要它：迁移只在服务启动时由 `schemaPhase` 跑一次。dev server 若在
 *              新迁移文件加入之前就已启动，instrumentation 不会重跑 —— 新列不存在，
 *              相关接口直接 500（2026-11-14 `/api/notifications` 真实现场）。
 *              本脚本用 `.env` 里的连接信息建独立连接池后跑同一份 `ALL_MIGRATIONS`，
 *              runner 自带 `schema_migrations` 账本与幂等判断，重复执行安全。
 *
 * 用法：`npm run db:migrate`（需 .env 中的 DB_*）。
 * 注意：不 import `lib/db/pool`（那是 `server-only` 模块，仅 Next 打包环境可用）。
 */
import mysql2 from "mysql2/promise";
import { runMigrations } from "../../src/lib/db/migrations/runner";
import { ALL_MIGRATIONS } from "../../src/lib/db/schema";

async function main() {
  const pool = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 2,
  });

  const target = `${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 3306}/${
    process.env.DB_NAME || "crm"
  }`;
  console.log(`[db:migrate] target ${target}, migrations ${ALL_MIGRATIONS.length}`);

  const applied = await runMigrations(pool, ALL_MIGRATIONS);
  console.log(`[db:migrate] applied ${applied} migration(s)`);

  const [rows] = await pool.query(
    "SELECT version, name, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5",
  );
  for (const r of rows as Array<{ version: number; name: string; applied_at: unknown }>) {
    console.log(`  v${String(r.version).padStart(3, "0")} ${r.name} @ ${String(r.applied_at)}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[db:migrate] failed:", err);
  process.exit(1);
});
