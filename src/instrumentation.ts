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
 * 注意：使用 eval("require") 而非 await import() 来加载服务器端模块，
 * 防止 webpack 在客户端构建时静态分析并跟踪 Node.js 依赖链
 * （alipay-sdk → urllib → undici → node:console 等）。
 * instrumentation.ts 仅在 Node.js 运行时执行，客户端永远不会触达这些代码。
 */
import type { Pool } from "mysql2/promise";

// dev 热重载守卫：防止热重载重复注册
let started = false;

/**
 * 服务器端模块加载器 — 绕过 webpack 静态分析
 * 使用 eval("require") 使 webpack 无法在编译期确定依赖关系，
 * 从而避免将 Node.js 服务器端包打入客户端 bundle。
 */
function serverRequire<T>(moduleId: string): T {
  // eslint-disable-next-line no-eval
  return eval("require")(moduleId);
}

export async function register() {
  if (started) return;
  started = true;

  // instrumentation 只应在 Node.js runtime 执行
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getPool } = serverRequire<{ getPool: () => Pool }>("./server/db/pool");
  const { getContext } = serverRequire<{ getContext: typeof import("./server/db/context").getContext }>("./server/db/context");
  const {
    schemaPhase,
    seedsPhase,
    agencyAliasPhase,
    backfillPhase,
    featuredPhase,
    paymentPhase,
    executePhase,
  } = serverRequire<typeof import("./server/lifecycle/phases")>("./server/lifecycle/phases");
  const { runWarmup } = serverRequire<{ runWarmup: (opts: Record<string, unknown>) => Promise<void> }>("./server/lifecycle/warmup");
  const { startBackgroundTasks, registerShutdownHooks } = serverRequire<{
    startBackgroundTasks: (pool: Pool) => { stop: () => void };
    registerShutdownHooks: (cb: () => void) => void;
  }>("./server/lifecycle/background");

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
  });
}

/** Meilisearch 异步初始化：健康检查 + 索引创建 */
async function initMeilisearchAsync(dbPool: Pool) {
  const { initMeilisearch, ensureIndex } = serverRequire<{
    initMeilisearch: () => ReturnType<typeof import("./server/services/meilisearch/index").initMeilisearch>;
    ensureIndex: () => Promise<boolean>;
  }>("./server/services/meilisearch/index");
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
