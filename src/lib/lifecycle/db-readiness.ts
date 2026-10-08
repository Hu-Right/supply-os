/**
 * 启动期数据库就绪等待
 * Bootstrap database-readiness gate
 *
 * @module lib/lifecycle/db-readiness
 * @description 【2026-10-08 事故根治】服务器开机时 mysqld 与 PM2 拉起的应用几乎同时启动，
 *              而 InnoDB crash recovery（生产宽表 46 万行 + 全文索引）可持续数分钟——
 *              此窗口内 3306 尚未 bind，任何启动期查询都会以 ECONNREFUSED 秒失败。
 *              原启动流程「撞一次即抛」，而 Next.js 对 instrumentation 抛错只记日志、
 *              **不退出进程**，导致应用永久停在「对外 online 但同步任务/预热/关闭钩子
 *              全部未注册」的静默半死状态，只能靠人肉 pm2 list 发现。
 *              这里改为指数退避的就绪轮询，把开机竞态自愈掉；预算耗尽才放弃启动。
 */

/** 就绪探测所需的最小连接池能力（鸭子类型，便于单测注入替身） */
export interface Pingable {
  query(sql: string): Promise<unknown>;
}

export interface ReadinessOptions {
  /** 总等待预算，默认 5 分钟（覆盖大库 crash recovery 窗口） */
  timeoutMs?: number;
  /** 首次退避基数，默认 500ms */
  baseDelayMs?: number;
  /** 单次退避上限，默认 5s（避免 recovery 期间高频空转压 accept 队列） */
  maxDelayMs?: number;
  /** 可注入的 sleep（单测用） */
  sleep?: (ms: number) => Promise<void>;
  /** 可注入的时钟（单测用） */
  now?: () => number;
  /** 每次探测失败后的进度回调（调用方用于打日志） */
  onWait?: (info: { attempt: number; waitedMs: number; nextDelayMs: number; reason: string }) => void;
}

export interface ReadinessOutcome {
  /** 数据库是否在预算内就绪 */
  ok: boolean;
  /** 累计等待毫秒数 */
  waitedMs: number;
  /** 探测总次数 */
  attempts: number;
  /** 最后一次失败原因（成功时为空串） */
  lastError: string;
  /** 本次生效的等待预算（供调用方拼日志） */
  budgetMs: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;

const realSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 轮询 `SELECT 1` 直到成功或预算耗尽。
 * 不抛错——返回 ok=false 由调用方决定如何 fail-fast，
 * 以便调用方在退出前打印完整的诊断信息。
 */
export async function waitForDatabase(
  pool: Pingable,
  options: ReadinessOptions = {},
): Promise<ReadinessOutcome> {
  const budgetMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;

  const startedAt = now();
  let attempts = 0;
  // 不在这里赋初值：成功分支一律上报空串，避免把上一轮的失败原因带进启动日志
  let lastError: string;

  for (;;) {
    attempts += 1;
    try {
      await pool.query("SELECT 1");
      return { ok: true, waitedMs: now() - startedAt, attempts, lastError: "", budgetMs };
    } catch (err) {
      lastError = (err as Error)?.message || String(err);
      const waitedMs = now() - startedAt;
      // 预算耗尽：不再退避，立刻交回调用方
      if (waitedMs >= budgetMs) {
        return { ok: false, waitedMs, attempts, lastError, budgetMs };
      }
      const nextDelayMs = Math.min(baseDelayMs * 2 ** (attempts - 1), maxDelayMs);
      options.onWait?.({ attempt: attempts, waitedMs, nextDelayMs, reason: lastError });
      await sleep(nextDelayMs);
    }
  }
}
