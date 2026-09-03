/**
 * MySQL2 连接池 — globalThis 单例
 *
 * @module lib/db/pool
 * @description Next.js standalone 模式下，模块可能被多次导入（热重载/多 Worker）。
 *              使用 globalThis 缓存 Pool 实例，防止连接池泄漏。
 *              与 server/db/pool.ts 的 createDbPool() 配置完全一致。
 */
import "server-only";
import mysql2 from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { DbConfigSchema } from "./db-config";

const globalForDb = globalThis as unknown as { _pool: Pool | undefined };

export function getPool(): Pool {
  if (globalForDb._pool) return globalForDb._pool;

  // fail-fast：env 派生配置经 zod 运行时校验后才进入连接池（净化解直连 createPool）
  const cfg = DbConfigSchema.parse({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
  });
  if (process.env.NODE_ENV === "production" && (!cfg.password || cfg.user === "root")) {
    console.warn(
      "\n╔══════════════════════════════════════════════════════════════╗\n" +
        "║  [db-pool] ✗ 安全警告：生产环境数据库使用默认凭据！          ║\n" +
        "║  请在 .env 中配置 DB_USER 和 DB_PASSWORD，避免 root 无密码  ║\n" +
        "╚══════════════════════════════════════════════════════════════╝\n",
    );
  }

  const pool = mysql2.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 20),
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    idleTimeout: 60000,
    connectTimeout: 30000,
    queueLimit: 0,
  });

  // 连接级错误通过查询 promise 冒泡，无需（也无法）在 PromisePool 上监听 error 事件
  // globalThis 单例缓存（dev 与生产共用）：Next.js 模块可能被多次实例化，
  // 不缓存会导致每次 getPool() 新建一个连接池且永不回收，耗尽 MySQL 连接
  globalForDb._pool = pool;
  return pool;
}
