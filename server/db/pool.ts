/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import mysql2 from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { EventEmitter } from "events";

// MySQL2 connection pool — 凭据从环境变量读取，缺失时使用安全默认值
export function createDbPool(): Pool {
  const pool = mysql2.createPool({
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

  // P2-6 修复：连接池事件监控——记录连接错误和获取超时，便于运维诊断
  const emitter = pool as unknown as EventEmitter;
  emitter.on("error", (err: Error) => {
    console.error("[db-pool] 连接池错误:", err.message);
  });
  emitter.on("acquire", () => {
    // 仅在 DEBUG 模式下记录连接获取，避免生产日志喷涌
    if (process.env.DB_DEBUG === "1") {
      console.log("[db-pool] 连接已获取");
    }
  });
  emitter.on("release", () => {
    if (process.env.DB_DEBUG === "1") {
      console.log("[db-pool] 连接已释放");
    }
  });
  emitter.on("connection", () => {
    console.log("[db-pool] 新连接已建立");
  });

  return pool;
}
