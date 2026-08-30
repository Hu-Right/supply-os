/**
 * Next.js instrumentation hook
 *
 * 在 Next.js 启动时执行（生产 standalone 与 dev 均生效）：
 * 1. 复用 lifecycle/phases.ts 的 6 阶段启动流程
 * 2. 初始化 AppContext（触发 PaymentService.initDefault）
 * 3. Meilisearch 健康检查与索引初始化（非阻塞）
 * 4. 启动第一档后台任务（autoTranslate/reportCacheCleanup/timers）
 * 5. 启动第二档 5s 级任务（searchSync/syncRetryQueue/wideTableSync/featuredSync）
 * 6. 预热（后台异步）
 * 7. 注册 SIGTERM 处理器
 *
 * 二档任务说明（2026-08-28 根治性回归）：
 *   原计划外置独立 worker，但 compose/Dockerfile 均无 worker 入口，导致
 *   生产环境宽表与 Meilisearch 增量同步完全不运行（外部管道新数据陈旧）。
 *   现默认在本进程启动（SYNC_WORKER_IN_APP=on），单实例部署零额外成本；
 *   未来多实例部署时设 SYNC_WORKER_IN_APP=off 并另行部署 worker 进程。
 */
import type { Pool } from "mysql2/promise";

// dev 热重载守卫：防止热重载重复注册
let started = false;

export async function register() {
  if (started) return;
  started = true;

  // instrumentation 只应在 Node.js runtime 执行
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getPool } = await import("./lib/db/pool");
  const { getContext } = await import("./lib/db/context");
  const {
    schemaPhase,
    backfillPhase,
    featuredPhase,
    paymentPhase,
    executePhase,
  } = await import("./lib/lifecycle/phases");
  const { runWarmup } = await import("./lib/lifecycle/warmup");
  const { startBackgroundTasks, registerShutdownHooks } = await import("./lib/lifecycle/background");

  const dbPool: Pool = getPool();

  // 阶段 1-4：与 Express 启动完全一致（种子数据已禁用，不再对数据库进行任何读写）
  const phases = [schemaPhase, backfillPhase, featuredPhase, paymentPhase];
  for (const phase of phases) {
    const ok = await executePhase(phase, { dbPool });
    if (!ok && !phase.optional) {
      // 提供更详细的错误信息，帮助诊断数据库连接问题
      const dbHost = process.env.DB_HOST || '127.0.0.1';
      const dbUser = process.env.DB_USER || 'root';
      const dbName = process.env.DB_NAME || 'crm';
      console.error(
        `\n[bootstrap] 启动失败诊断信息：\n` +
        `  - 失败阶段：${phase.name}\n` +
        `  - 数据库配置：${dbUser}@${dbHost}/${dbName}\n` +
        `  - 可能原因：\n` +
        `    1. 数据库服务未运行\n` +
        `    2. 数据库凭据错误（DB_USER/DB_PASSWORD）\n` +
        `    3. 数据库主机不可达（网络问题）\n` +
        `    4. 数据库不存在（DB_NAME=${dbName}）\n` +
        `  - 请检查 .next/standalone/.env 文件中的数据库配置\n`
      );
      throw new Error(`启动阶段 ${phase.name} 失败，服务终止`);
    }
  }

  // 触发 PaymentService.initDefault 与所有 Repo 初始化
  const ctx = getContext();

  // ── 第二档 5s 级同步任务（根治：默认随进程启动）──
  const stops: Array<() => void> = [];
  const meiliEnabled = String(process.env.MEILI_ENABLED ?? "off").toLowerCase() === "on";

  // Meilisearch 初始化（非阻塞）；就绪后拉起 Meili 同步与重试队列
  if (meiliEnabled) {
    void (async () => {
      try {
        const { initMeilisearch, ensureIndex } = await import("./lib/services/meilisearch/index");
        const client = initMeilisearch();
        if (!client) return;
        const ok = await ensureIndex();
        if (!ok) {
          console.warn("[meilisearch] 索引未就绪，搜索将降级到 MySQL FULLTEXT");
          return;
        }
        const { startSearchSync } = await import("./lib/services/search-sync/index");
        const { startSyncRetryQueue } = await import("./lib/services/search-sync/sync-retry-queue");
        stops.push(startSearchSync(dbPool, { intervalMs: 5 * 1000 }));
        stops.push(startSyncRetryQueue(dbPool));
      } catch (e) {
        console.warn("[meilisearch] 初始化失败（静默降级）:", (e as Error).message);
      }
    })();
  }

  if (String(process.env.SYNC_WORKER_IN_APP ?? "on").toLowerCase() !== "off") {
    // 宽表增量同步（水位扫描，同时补偿内存同步队列的进程重启丢失）
    const { startWideTableSync } = await import("./lib/services/search-sync/index");
    stops.push(startWideTableSync(dbPool, { intervalMs: 5 * 1000 }));

    // 精选状态变更 → 入同步队列（宽表 → Meilisearch 级联）
    const { registerFeaturedSyncCallback } = await import("./lib/services/notices/featured");
    const { enqueue } = await import("./lib/services/search-sync/sync-queue");
    registerFeaturedSyncCallback((ids: number[]) => {
      enqueue(dbPool, ids);
    });
  } else {
    console.log("[instrumentation] SYNC_WORKER_IN_APP=off：二档同步任务未在本进程启动（预期由独立 worker 承担）");
  }

  // 启动第一档后台任务
  const backgroundHandle = startBackgroundTasks(dbPool);

  // 预热（后台异步，不阻塞）
  void runWarmup({ dbPool, directoryRepo: ctx.supplier.directoryRepo }).catch((e) =>
    console.error("[warmup] 失败:", (e as Error).message),
  );

  // 注册优雅关闭
  registerShutdownHooks(() => {
    backgroundHandle.stop();
    stops.forEach((stop) => stop());
    // 关闭连接池由 Next.js 进程退出自动回收；
    // 如需显式关闭，可在此调用 dbPool.end()。
  });
}
