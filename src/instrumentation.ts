/**
 * Next.js instrumentation hook
 *
 * 在 Next.js 启动时执行：
 * 1. 复用 lifecycle/phases.ts 的 6 阶段启动流程
 * 2. 初始化 AppContext（触发 PaymentService.initDefault）
 * 3. Meilisearch 健康检查与索引初始化（非阻塞）
 * 4. 启动第一档后台任务（autoTranslate/reportCacheCleanup/timers）
 * 5. 预热（后台异步）
 * 6. 注册 SIGTERM 处理器
 *
 * 第二档 5s 级任务（searchSync/syncRetryQueue/wideTableSync/featuredSyncCallback）
 * 按迁移计划中期外置为独立 worker，不在此处启动。
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
    seedsPhase,
    agencyAliasPhase,
    backfillPhase,
    featuredPhase,
    paymentPhase,
    executePhase,
  } = await import("./lib/lifecycle/phases");
  const { runWarmup } = await import("./lib/lifecycle/warmup");
  const { startBackgroundTasks, registerShutdownHooks } = await import("./lib/lifecycle/background");

  const dbPool: Pool = getPool();

  // 阶段 1-6：与 Express 启动完全一致
  const phases = [schemaPhase, seedsPhase, agencyAliasPhase, backfillPhase, featuredPhase, paymentPhase];
  for (const phase of phases) {
    const ok = await executePhase(phase, { dbPool });
    if (!ok && !phase.optional) {
      throw new Error(`启动阶段 ${phase.name} 失败，服务终止`);
    }
  }

  // 触发 PaymentService.initDefault 与所有 Repo 初始化
  const ctx = getContext();

  // Meilisearch 初始化（非阻塞）
  if (String(process.env.MEILI_ENABLED ?? "off").toLowerCase() === "on") {
    void initMeilisearchAsync(dbPool);
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
    // 关闭连接池由 Next.js 进程退出自动回收；
    // 如需显式关闭，可在此调用 dbPool.end()。
  });
}

/** Meilisearch 异步初始化：健康检查 + 索引创建 */
async function initMeilisearchAsync(dbPool: Pool) {
  const { initMeilisearch, ensureIndex } = await import("./lib/services/meilisearch/index");
  try {
    const client = initMeilisearch();
    if (client) {
      const ok = await ensureIndex();
      if (!ok) {
        console.warn("[meilisearch] 索引未就绪，搜索将降级到 MySQL FULLTEXT");
      }
    }
  } catch (e) {
    console.warn("[meilisearch] 初始化失败（静默降级）:", (e as Error).message);
  }
}
