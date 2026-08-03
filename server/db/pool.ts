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
  });
}
