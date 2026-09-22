/**
 * 爬虫源库 MySQL2 连接池 — globalThis 单例
 * Crawler source DB connection pool
 *
 * @module lib/db/source-pool
 * @description 供应用内定时爬虫同步任务读取内网爬虫库（scripts/daily-sync.cjs 的 SOURCE）。
 *              与主库池分离为独立小连接池，避免跨库批量拉取挤占 API 请求连接。
 *              未配置 SYNC_SOURCE_HOST 时返回 null，爬虫同步任务整体不启动（优雅降级）。
 *
 *              ⚠️ dateStrings:true 是水位线正确性红线：DATETIME 列以列原值字符串读写，
 *              否则 mysql2 按本地时区解析 Date，导致 update_time 水位线偏移 8 小时
 *              （见 scripts/daily-sync.cjs 同名注释）。
 */
import "server-only";
import mysql2 from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { SourceDbConfigSchema } from "./db-config";

// null = 已判定为「未配置/禁用」，缓存避免每轮重复解析 env 与打印告警
const globalForSourceDb = globalThis as unknown as {
  _sourcePool: Pool | null | undefined;
};

/** 源库是否已配置（SYNC_SOURCE_HOST 非空即视为启用应用内爬虫同步） */
export function isSourceConfigured(): boolean {
  return Boolean(process.env.SYNC_SOURCE_HOST);
}

/**
 * 获取爬虫源库连接池。
 * @returns 已配置的 Pool；未配置 SYNC_SOURCE_HOST 时返回 null（调用方据此跳过爬虫同步）。
 */
export function getSourcePool(): Pool | null {
  if (globalForSourceDb._sourcePool === null) return null; // 已判定禁用
  if (globalForSourceDb._sourcePool) return globalForSourceDb._sourcePool;

  if (!process.env.SYNC_SOURCE_HOST) {
    globalForSourceDb._sourcePool = null;
    return null;
  }

  // fail-fast：配置非法（如 host 含非法字符）时告警并禁用，不阻断主服务启动
  const parsed = SourceDbConfigSchema.safeParse({
    host: process.env.SYNC_SOURCE_HOST,
    port: Number(process.env.SYNC_SOURCE_PORT || 3306),
    user: process.env.SYNC_SOURCE_USER || "root",
    password: process.env.SYNC_SOURCE_PASSWORD || "",
    database: process.env.SYNC_SOURCE_DATABASE || "crm",
  });
  if (!parsed.success) {
    console.warn("[source-pool] SYNC_SOURCE_* 配置非法，爬虫同步任务不启动:", parsed.error.issues[0]?.message || "");
    globalForSourceDb._sourcePool = null;
    return null;
  }
  const cfg = parsed.data;

  const pool = mysql2.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: "utf8mb4",
    dateStrings: true,
    waitForConnections: true,
    // 独立小池：跨库批量拉取不与全站 API 争抢主池连接
    connectionLimit: Number(process.env.SYNC_SOURCE_POOL_LIMIT || 3),
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    idleTimeout: 60000,
    connectTimeout: 30000,
    queueLimit: 0,
  });

  globalForSourceDb._sourcePool = pool;
  console.log(`[source-pool] 爬虫源库连接池已建立：${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  return pool;
}

/** 关闭爬虫源库连接池（优雅退出时调用）。 */
export async function closeSourcePool(): Promise<void> {
  if (globalForSourceDb._sourcePool) {
    console.log("[source-pool] 正在关闭爬虫源库连接池…");
    await globalForSourceDb._sourcePool.end().catch(() => {});
    globalForSourceDb._sourcePool = undefined;
  }
}
