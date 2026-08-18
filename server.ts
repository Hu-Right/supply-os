/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 本地开发从 .env 读取环境变量（YOUDAO_APP_KEY 等）；无 .env 时静默跳过，
// 不影响 AI Studio 的运行时注入
import "dotenv/config";
import { startServer } from "./server/bootstrap";

// ── C1【P0】优雅关闭接线（详见《深度技术分析报告》§C1）──
// 背景：原实现丢弃了 startServer() 返回的 stop 句柄，且未监听任何进程信号，
// 导致容器/进程管理器重启时在途请求被硬切断、同步队列与连接池不被冲刷。
// 现在的关闭顺序：SIGTERM/SIGINT → 停后台任务 → 停接收新请求并排空在途请求
// → 关闭 MySQL 连接池 → 退出；超时兜底强制退出，防止关闭流程自身挂死。

/** 防止 SIGTERM 与 SIGINT 连续触发导致重复关闭 */
let shuttingDown = false;

/** 优雅关闭超时（毫秒）：排空超时则强制退出，避免进程挂死等待 SIGKILL */
const SHUTDOWN_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000),
);

const handle = await startServer();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] 收到 ${signal}，开始优雅关闭…`);

    // 兜底定时器：在途请求长时间不结束时强制退出。
    // unref() 保证该定时器本身不阻止进程正常退出。
    const forceTimer = setTimeout(() => {
      console.error(`[server] 优雅关闭超时（${SHUTDOWN_TIMEOUT_MS}ms），强制退出`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    handle
      .shutdown()
      .then(() => {
        console.log("[server] 优雅关闭完成，进程退出");
        process.exit(0);
      })
      .catch((err) => {
        console.error("[server] 优雅关闭异常，强制退出:", err);
        process.exit(1);
      });
  });
}
