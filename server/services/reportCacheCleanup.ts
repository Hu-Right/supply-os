/**
 * 报告缓存月度清理定时任务
 * Monthly bid report cache cleanup scheduler
 *
 * @description 每月 1 号 08:00（服务器本地时区）清空 runtime/bid_reports/ 下的
 *              全部缓存 docx，作为指纹失效机制之外的兜底，防止绕过 CRM 直改库
 *              等场景产生的过期文件长期堆积。缓存为纯加速层，清除后下次下载
 *              自动重建，不影响功能。
 *              注意：setTimeout 延时上限约 24.8 天，跨月等待必须分段调度，
 *              这里以 CHECK_CAP_MS 为步长链式逼近目标时刻。
 */
import { promises as fs } from "fs";
import path from "path";

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

export interface ReportCacheCleanupConfig {
  enabled: boolean;
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
        } catch (err: any) {
          console.warn(`[report-cache] monthly cleanup failed: ${err?.message || err}`);
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
