/**
 * 爬虫同步调度器（应用内定时）
 * Crawler Sync Scheduler (in-app timer)
 *
 * @module lib/services/search-sync/crawler-sync-scheduler
 * @description 在 Next 进程内定时跑「爬虫库 → 主表」增量同步，主表全部写完后
 *              立即对变更公告 id 级联宽表（syncWideIds 内部再级联 Meili），
 *              最后增量重建对外服务表 crm_notice_public（notice-public-v2，ops 脚本缺失自动跳过）。
 *              同进程串行天然保证「主表完整 → 才更新宽表/服务表」的顺序，无需跨进程锁。
 *
 *              与现有 startWideTableSync（5s 轮询）互补：
 *              - 爬虫新数据走本调度器的显式级联（本轮主表写完即推宽表）；
 *              - 平台自建公告 / 对账修复仍走 5s 轮询；
 *              - 二者对宽表都是幂等 upsert，宽表单一写入者仍是应用，不冲突。
 *
 *              源库未配置（getSourcePool 返回 null）时 runCrawlerSyncOnce 直接 skipped，
 *              本调度器空转无害；公网部署够不到内网爬虫库时自动降级为「仅平台自建」。
 */
import type { Pool } from "mysql2/promise";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runCrawlerSyncOnce } from "./crawler-sync";
import { syncWideIds } from "./sync-scheduler";

export interface CrawlerSyncOptions {
  /** 同步间隔（毫秒），默认读 SYNC_INTERVAL_MS，回退 1 小时 */
  intervalMs?: number;
  /** 启动后首轮延迟（毫秒），默认 15s，给启动阶段 API 请求让路 */
  kickoffDelayMs?: number;
}

/** 级联宽表的分批大小（syncWideIds 内部还会再级联 Meili） */
const CASCADE_BATCH = 500;

/**
 * 服务表重建脚本（scripts/ops/ 不入库，见 .gitignore）：
 * 主表/宽表写完后的第三棒——notice-public-v2 --changed --apply --prune 增量重建 crm_notice_public。
 * 脚本缺失（生产 standalone / 换机克隆）时静默跳过，交由手动执行兜底；
 * env 直用父进程（standalone 起服本就带 supply_os_app 凭证，v2 的 .env 解析只补缺）。
 */
const NOTICE_PUBLIC_V2 = process.env.NOTICE_PUBLIC_V2_SCRIPT
  || resolve(process.cwd(), "scripts/ops/notice-public-v2.ts");
const REBUILD_TIMEOUT_MS = 15 * 60 * 1000;
let rebuildRunning = false;

/** 单飞 + 超时兜底地跑一轮服务表增量重建；任何失败只告警，下轮再试 */
async function rebuildNoticePublic(): Promise<void> {
  if (rebuildRunning) return; // 上一轮还没跑完：跳过本轮（v2 --changed 幂等，下轮补上）
  if (!existsSync(NOTICE_PUBLIC_V2)) return; // ops 脚本不存在的环境：静默降级
  rebuildRunning = true;
  const t0 = Date.now();
  try {
    await new Promise<void>((settled) => {
      // win32 下 npx 是 .cmd，必须走 shell
      const child = spawn("npx", ["tsx", NOTICE_PUBLIC_V2, "--changed", "--apply", "--prune"], {
        cwd: process.cwd(),
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let timedOut = false;
      let tail = "";
      const collect = (d: Buffer) => { tail += String(d); if (tail.length > 8000) tail = tail.slice(-8000); };
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, REBUILD_TIMEOUT_MS);
      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      child.on("error", (err) => { clearTimeout(timer); console.warn(`[crawler-sync] 服务表重建启动失败（跳过）: ${err.message}`); settled(); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) console.warn(`[crawler-sync] 服务表重建超 ${REBUILD_TIMEOUT_MS / 60000} 分钟被杀（下轮再试）:\n${tail.slice(-1500)}`);
        else if (code !== 0) console.warn(`[crawler-sync] 服务表重建退出码 ${code}（下轮再试）:\n${tail.slice(-1500)}`);
        else console.log(`[crawler-sync] 服务表重建完成（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
        settled();
      });
    });
  } finally {
    rebuildRunning = false;
  }
}

/** 去重后分批级联宽表；失败仅告警，交由宽表 5s 轮询 / 5 分钟全量对账兜底 */
async function cascadeWide(pool: Pool, ids: number[]): Promise<void> {
  const uniq = Array.from(new Set(ids));
  for (let i = 0; i < uniq.length; i += CASCADE_BATCH) {
    const batch = uniq.slice(i, i + CASCADE_BATCH);
    try {
      await syncWideIds(pool, batch);
    } catch (err) {
      console.warn(`[crawler-sync] 级联宽表失败（本批 ${batch.length} 条，交由轮询/对账兜底）:`, (err as Error).message);
    }
  }
}

/**
 * 启动应用内爬虫同步定时器。
 * @returns 停止函数（清除定时器）
 */
export function startCrawlerSync(pool: Pool, options: CrawlerSyncOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? Number(process.env.SYNC_INTERVAL_MS || 3600000);
  const kickoffDelayMs = options.kickoffDelayMs ?? 15 * 1000;
  let stopped = false;
  let running = false;

  const tick = async (): Promise<void> => {
    if (stopped || running) return; // 防重入：上一轮未结束跳过本轮
    running = true;
    try {
      const { skipped, totalSynced, changedNoticeIds } = await runCrawlerSyncOnce(pool);
      if (skipped) return; // 源库未配置：静默不级联
      if (totalSynced > 0) {
        console.log(`[crawler-sync] 主表同步完成：共 ${totalSynced} 条，公告变更 ${changedNoticeIds.length} 条 → 级联宽表`);
      }
      // 主表全部写完后，才级联宽表 → Meili → 服务表（顺序保证：交付层永远吃完整输入）
      if (changedNoticeIds.length > 0) {
        await cascadeWide(pool, changedNoticeIds);
      }
      await rebuildNoticePublic();
    } catch (err) {
      // 静默降级：爬虫同步失败不影响 API 与其他同步任务
      console.warn("[crawler-sync] 本轮同步异常（静默降级）:", (err as Error).message);
    } finally {
      running = false;
    }
  };

  // 首轮延迟执行：给启动阶段（迁移/预热/API）让路，避免跨库批量拉取争抢连接
  const kickoff = setTimeout(() => { void tick(); }, kickoffDelayMs);
  const timer = setInterval(() => { void tick(); }, intervalMs);

  return () => {
    stopped = true;
    clearTimeout(kickoff);
    clearInterval(timer);
  };
}
