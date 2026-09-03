/**
 * 月度清理定时任务（报告缓存 + 过期译文）
 * Monthly cleanup scheduler (report cache + expired translations)
 *
 * @description 每月 1 号 08:00（服务器本地时区）执行两项清理：
 *              1. 清空 runtime/bid_reports/ 下全部缓存 docx；
 *              2. 删除已过期 90 天以上的公告/精选数据译文缓存行（源数据不动）。
 *              缓存为纯加速层，清除后下次访问自动重建，不影响功能。
 *              注意：setTimeout 延时上限约 24.8 天，跨月等待必须分段调度，
 *              这里以 CHECK_CAP_MS 为步长链式逼近目标时刻。
 */
import { promises as fs } from "fs";
import path from "path";
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 与 report.routes.ts 同一目录约定 */
const reportCacheDir = () => path.join(process.cwd(), "runtime", "bid_reports");

/** 单段等待上限：6 小时（远小于 setTimeout 的 2^31-1 ms 上限，且时钟漂移可控） */
const CHECK_CAP_MS = 6 * 60 * 60 * 1000;

/** 计算下一个"每月 1 号 08:00"（本地时区）的时间戳 */
export function nextMonthlyRunAt(now: Date): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), 1, 8, 0, 0, 0);
  if (candidate.getTime() > now.getTime()) return candidate; // 本月 1 号 8 点还没到（仅 1 号凌晨可能）
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);
}

/** 清空缓存目录下全部 .docx，返回删除数量；目录不存在视为 0 */
export async function clearReportCache(dir = reportCacheDir()): Promise<number> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0; // 目录尚未创建过
  }
  const targets = names.filter((f) => f.toLowerCase().endsWith(".docx"));
  const results = await Promise.all(
    targets.map((f) => fs.unlink(path.join(dir, f)).then(() => 1 as const).catch(() => 0 as const))
  );
  return results.reduce<number>((sum, n) => sum + n, 0);
}

/** 过期判定条件（两条 DELETE 的 WHERE 子句共用同一字面量，纯静态无插值） */

/**
 * 删除已过期 90 天以上的公告/精选译文缓存行（源数据不动）。
 * 返回 { notices, opportunities } 各删除行数。
 */
export async function clearExpiredTranslations(
  dbPool: Pool
): Promise<{ notices: number; opportunities: number }> {
  const [noticeResult] = await dbPool.query(
    "DELETE t FROM crm_notice_translations t JOIN crm_bid_notices n ON n.id = t.notice_id WHERE n.deadline_sec > 0 AND n.deadline_sec < UNIX_TIMESTAMP(NOW()) - 90 * 86400"
  );
  const [oppResult] = await dbPool.query(
    "DELETE t FROM crm_opportunity_translations t JOIN crm_bid_opportunities n ON n.id = t.opportunity_id WHERE n.deadline_sec > 0 AND n.deadline_sec < UNIX_TIMESTAMP(NOW()) - 90 * 86400"
  );
  return {
    notices: (noticeResult as RowDataPacket).affectedRows ?? 0,
    opportunities: (oppResult as RowDataPacket).affectedRows ?? 0,
  };
}

export interface ReportCacheCleanupConfig {
  enabled: boolean;
  /** 传入 dbPool 后月度清理同时删除过期 90 天的译文缓存行 */
  dbPool?: Pool;
}

/**
 * 启动月度清理调度，返回 stop 函数供优雅关闭
 */
export function startReportCacheCleanup(cfg: ReportCacheCleanupConfig): () => void {
  if (!cfg.enabled) {
    console.log("[report-cache] monthly cleanup disabled");
    return () => undefined;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    const now = new Date();
    const runAt = nextMonthlyRunAt(now);
    const delay = Math.min(runAt.getTime() - now.getTime(), CHECK_CAP_MS);
    timer = setTimeout(async () => {
      // 到点才执行；分段唤醒未到点则直接进入下一段等待
      if (new Date().getTime() >= runAt.getTime()) {
        try {
          const removed = await clearReportCache();
          console.log(`[report-cache] monthly cleanup done, removed ${removed} file(s)`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[report-cache] monthly cleanup failed: ${msg}`);
        }
        // 过期译文清理（源数据不动，仅删缓存行）
        if (cfg.dbPool) {
          try {
            const { notices, opportunities } = await clearExpiredTranslations(cfg.dbPool);
            console.log(
              `[translation-cleanup] monthly done, removed notices=${notices} opportunities=${opportunities}`
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[translation-cleanup] monthly failed: ${msg}`);
          }
        }
      }
      schedule();
    }, delay);
  };

  schedule();
  console.log(`[report-cache] monthly cleanup scheduled (1st of month 08:00, next: ${nextMonthlyRunAt(new Date()).toLocaleString()})`);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
