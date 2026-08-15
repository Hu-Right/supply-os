/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import mysql2 from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { EventEmitter } from "events";

// MySQL2 connection pool — 凭据从环境变量读取，缺失时使用安全默认值
export function createDbPool(): Pool {
  // M-CFG-1 安全警告：生产环境使用默认凭据（root 无密码）时输出醒目警告
  // 防止运维人员忘记配置 .env 导致裸奔
  const dbUser = process.env.DB_USER || "root";
  const dbPassword = process.env.DB_PASSWORD || "";
  if (process.env.NODE_ENV === "production" && (!dbPassword || dbUser === "root")) {
    console.warn(
      "\n╔══════════════════════════════════════════════════════════════╗\n" +
      "║  [db-pool] ✗ 安全警告：生产环境数据库使用默认凭据！          ║\n" +
      "║  请在 .env 中配置 DB_USER 和 DB_PASSWORD，避免 root 无密码  ║\n" +
      "╚══════════════════════════════════════════════════════════════╝\n"
    );
  }

  const pool = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: dbUser,
    password: dbPassword,
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
    // Tailscale 远程连接优化：增大连接超时，避免高延迟下连接失败
    connectTimeout: 30000, // 30s 连接超时（默认 10s，远程中继场景下容易超时）
    queueLimit: 0, // 无等待队列上限，避免突发请求直接拒绝
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
  return pool;
}
