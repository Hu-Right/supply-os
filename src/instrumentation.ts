/**
 * Next.js instrumentation hook
 *
 * 在 Next.js 启动时执行（生产 standalone 与 dev 均生效）：
 * 0. 等待数据库就绪（指数退避，根治开机竞态）
 * 1. 复用 lifecycle/phases.ts 的启动阶段流程
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

/**
 * 致命启动失败：真正结束进程。
 *
 * 【为什么不能只 throw】Next.js 对 instrumentation hook 的抛错只记一条
 * "An error occurred while loading instrumentation hook" 日志、**不退出进程**。
 * 于是本函数后续全部初始化（getContext / 六路同步任务 / 预热 / SIGTERM 关闭钩子）
 * 永远不会执行，而进程仍以 online 姿态对外服务——2026-10-08 事故正是这个形态：
 * 网站能开、内存还在涨，但数据管道全停，只能靠人肉 pm2 list 发现。
 * 「服务终止」这句话必须兑现，故这里直接 exit(1) 交给 PM2 重启，让故障在监控上可见。
 *
 * 构建期例外：`next build` 的环境没有生产 DB、也可能没有 PAYMENT_MODE，
 * 此时退出会把 build 打死，故退回 throw。
 */
function abortStartup(reason: string): never {
  console.error(`[bootstrap] ✗ ${reason}`);
  if (process.env.NEXT_PHASE === "phase-production-build") {
    throw new Error(reason);
  }
  // 绕过 Edge Runtime 静态扫描：Next.js 会把本模块同时编进 Edge bundle，Turbopack 按
  // 语法匹配成员表达式 `process.exit` 就报 "A Node.js API is used (process.exit ...)
  // not supported in the Edge Runtime"。它不认 register() 顶部的 NEXT_RUNTIME 守卫
  // （那是运行时判断，非静态判断）。先把 process 存成本地别名再取 .exit，打破
  // `process.exit` 的字面成员访问模式；本函数只在 nodejs 分支被调用，行为完全不变。
  const nodeProcess = process;
  nodeProcess.exit(1);
  // nodeProcess.exit 类型上返回 void；显式 throw 满足 never，并防御被 mock 的 exit
  throw new Error(reason);
}

export async function register() {
  if (started) return;
  started = true;

  // instrumentation 只应在 Node.js runtime 执行
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 构建期跳过全部启动引导：这里注册的是常驻进程才需要的连接池、定时器与关闭钩子，
  // 在 `next build` 中既无意义，又会因构建环境无生产 DB / 未配 PAYMENT_MODE 而打死 build。
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // 支付模式 fail-fast（审查 F21）：PAYMENT_MODE 缺省回落 mock，生产漏配时
  // mock-paid 等自激活端点可达，支付形同虚设；生产必须显式 live
  if (process.env.NODE_ENV === "production" && process.env.PAYMENT_MODE !== "live") {
    abortStartup(
      "生产环境必须显式配置 PAYMENT_MODE=live（当前值：" +
        (process.env.PAYMENT_MODE || "(未配置)") +
        "），拒绝以 mock 支付模式启动",
    );
  }

  // 生产消息通道配置告警（P1-5）：SMS_PROVIDER/SMTP 漏配时注册/找回静默降级
  // （短信验证码只进日志），不 fail-fast 但必须在部署检查单中人工确认
  if (process.env.NODE_ENV === "production") {
    const smsProvider = (process.env.SMS_PROVIDER || "mock").toLowerCase();
    if (smsProvider === "mock") {
      console.error(
        "[bootstrap] ⚠ 生产环境 SMS_PROVIDER 为 mock：短信验证码仅打印日志、不会真实发送，" +
          "注册/手机找回流程将不可用！请配置 SMS_PROVIDER=aliyun 及对应密钥",
      );
    }
    if (!process.env.SMTP_HOST) {
      console.error(
        "[bootstrap] ⚠ 生产环境未配置 SMTP_HOST：邮箱验证码/找回密码邮件将无法发送，" +
          "请配置 SMTP 连接信息",
      );
    }
  }

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
  const { waitForDatabase } = await import("./lib/lifecycle/db-readiness");
  const { startBackgroundTasks, registerShutdownHooks } = await import("./lib/lifecycle/background");

  const dbPool: Pool = getPool();

  // ── 阶段 0：等待数据库就绪 ──
  // 服务器开机时 mysqld 与 PM2 拉起的应用几乎同时启动，而 InnoDB crash recovery
  // 可能持续数分钟（此窗口 3306 尚未 bind → ECONNREFUSED 秒失败）。撞一次就放弃
  // 会让应用永久停在半初始化状态，故先退避轮询把开机竞态自愈掉。
  const ready = await waitForDatabase(dbPool, {
    onWait: ({ attempt, waitedMs, nextDelayMs, reason }) =>
      console.warn(
        `[bootstrap] 等待数据库就绪：第 ${attempt} 次探测失败（已等 ${waitedMs}ms，${nextDelayMs}ms 后重试）${reason}`,
      ),
  });
  if (!ready.ok) {
    abortStartup(
      `数据库在 ${ready.budgetMs}ms 预算内始终不可用（共探测 ${ready.attempts} 次），放弃启动。最后一次失败：${ready.lastError}`,
    );
  }
  if (ready.attempts > 1) {
    console.log(`[bootstrap] ✓ 数据库就绪（等待 ${ready.waitedMs}ms / 探测 ${ready.attempts} 次）`);
  }

  // 阶段 1-4：与 Express 启动完全一致（种子数据已禁用，不再对数据库进行任何读写）
  // schema 阶段已恢复：当 ALL_MIGRATIONS 为空时它只做账本检查，不产生 DDL。
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
      abortStartup(`启动阶段 ${phase.name} 失败，进程退出（exit 1）等待数据库恢复后重试`);
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

    // 爬虫库 → 主表增量同步（应用内定时；主表写完后级联宽表 → Meili）。
    // 源库未配置 SYNC_SOURCE_HOST 时内部自动跳过，不影响其他任务。
    const { startCrawlerSync } = await import("./lib/services/search-sync/crawler-sync-scheduler");
    stops.push(startCrawlerSync(dbPool));

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
