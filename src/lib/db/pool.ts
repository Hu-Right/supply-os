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

const globalForDb = globalThis as unknown as { _pool: Pool | undefined; _syncPool: Pool | undefined };

/** 业务池排队上限：队列满即快速失败，不要无限挂住 HTTP 请求等连接 */
const BUSINESS_QUEUE_LIMIT = 60;
/** 后台同步池连接数：后台对账永远只允许占这两个，绝不与 HTTP 请求争连接 */
const SYNC_POOL_LIMIT = 2;

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
    // 编码红线（docs/数据库设计/数据库字符集与排序规则统一规范.md §2）：连接层字符集必须显式声明，
    // 不依赖驱动默认值；dateStrings 因影响面大另行回归后变更，不在此同批引入
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 20),
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    idleTimeout: 60000,
    connectTimeout: 30000,
    // [2026-11-15 事故] 旧值 0 = 无限排队：连接池被后台对账占满时，登录/业务请求
    // 会一直挂在等连接上（实测 /api/auth/user 90 秒零字节返回），前端表现为
    // 「一直登录不上去」。设上限后溢出请求立刻失败，前端能拿到可重试的错误。
    queueLimit: BUSINESS_QUEUE_LIMIT,
  });

  // 连接级错误通过查询 promise 冒泡，无需（也无法）在 PromisePool 上监听 error 事件
  // globalThis 单例缓存（dev 与生产共用）：Next.js 模块可能被多次实例化，
  // 不缓存会导致每次 getPool() 新建一个连接池且永不回收，耗尽 MySQL 连接
  globalForDb._pool = pool;
  return pool;
}

/**
 * 后台同步专用连接池（小而独立）
 *
 * [2026-11-15 事故根治] 后台对账定时器（wide-table deadline 漂移扫描）在
 * `bid_notices`(96 万行) × 宽表已退役 上做无索引不等式全表 JOIN，
 * 单轮 80 秒以上；此前它和 HTTP 请求共用 10 连接的业务池，一轮就吃掉大半池位，
 * 登录请求排队挂死。分离后后台最多占 2 个连接，业务池 10 个与它互不侵占。
 *
 * @returns 恒为独立实例（不随业务池 connectionLimit 变化）
 */
export function getSyncPool(): Pool {
  if (globalForDb._syncPool) return globalForDb._syncPool;

  const cfg = DbConfigSchema.parse({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
  });

  const pool = mysql2.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: SYNC_POOL_LIMIT,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    idleTimeout: 60000,
    connectTimeout: 30000,
    // 后台任务排队即可（单飞闸保证同类任务不叠加），不设上限以保留「慢但会完成」的语义
    queueLimit: 0,
  });

  globalForDb._syncPool = pool;
  return pool;
}

/**
 * 关闭数据库连接池（优雅退出时调用）。
 * 等待所有活跃查询完成后释放连接，避免 MySQL 端出现僵尸 Sleep 连接。
 */
export async function closePool(): Promise<void> {
  if (globalForDb._pool || globalForDb._syncPool) console.log("[db-pool] 正在关闭连接池…");
  if (globalForDb._syncPool) {
    await globalForDb._syncPool.end().catch(() => { /* 关闭失败不影响退出 */ });
    globalForDb._syncPool = undefined;
  }
  if (globalForDb._pool) {
    await globalForDb._pool.end().catch(() => { /* 同上 */ });
    globalForDb._pool = undefined;
  }
  console.log("[db-pool] 连接池已关闭");
}

