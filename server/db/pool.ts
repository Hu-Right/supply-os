/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import mysql2 from "mysql2/promise";
import type { Pool } from "mysql2/promise";

// MySQL2 connection pool — 凭据从环境变量读取，缺失时使用安全默认值
export function createDbPool(): Pool {
  return mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
    waitForConnections: true,
    // 性能优化：连接池从 10 扩大到 20（阶段 1）
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 20),
    // P0 性能优化：启用 TCP KeepAlive——避免空闲连接被 MySQL 服务端关闭
    // 低并发场景下消除连接重建延迟（~50-100ms）
    // 回滚：删除 enableKeepAlive/keepAliveInitialDelay/idleTimeout 三行
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000, // 10s 后开始发送 KeepAlive 探测包
    idleTimeout: 60000, // 60s 空闲超时，超过后关闭连接
  });
}
