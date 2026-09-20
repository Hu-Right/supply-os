/**
 * 宽表同步调度器
 * Wide Table Sync Scheduler
 *
 * @module server/services/search-sync/sync-scheduler
 * @description 负责宽表同步的调度逻辑：全量回填、增量同步、按 ID 同步、就绪检查、定时器管理。
 *              数据构建细节由 wide-row-builder.ts 提供，本文件仅关心同步时机和流程编排。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { syncNoticeIds, isHealthy as isMeiliHealthy } from "../meilisearch";
import { tryRecover } from "../meilisearch/client";
import { enqueueRetry } from "./sync-retry-queue";
import { isWideTableReady } from "../search-common/wide-table-readiness";
import { logSyncCascade } from "../search-common/metrics";
import { requestIndexRebuild } from "../search-common/rebuild-trigger";
import { invalidateSearchCache } from "../search-common/sync-events";
import { PLATFORM_PUBLISHED_ONLY } from "../../utils/notice-expired";
import {
  WIDE_SYNC_SELECT, WIDE_SYNC_JOIN,
  loadAliasMap, loadTranslationsByNoticeIds, loadUnspscByNoticeIds, loadPreciseByNoticeIds,
  buildWideRow, upsertWideRows,
} from "./wide-row-builder";
import {
  detectDeadlineDrift, reconcileGhostRows, detectPlatformStatusDrift,
} from "./wide-row-reconcile";
import { detectWideFingerprintDrift } from "./wide-fingerprint";
import { purgeNoticeSearch } from "../search-visibility";

/**
 * 全量回填宽表
 */
export async function fullBackfill(pool: Pool): Promise<{ synced: number; elapsed: number }> {
  const start = Date.now();
  const aliasMap = await loadAliasMap(pool);
  
  let lastId = 0;
  let totalSynced = 0;
  const BATCH = 200;  // [内存优化] 从 500 降至 200，降低 8G 服务器宽表回填时的内存峰值

  try {
    while (true) {
      const [rows] = await pool.query(
        WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + " WHERE n.id > ? AND " + PLATFORM_PUBLISHED_ONLY + " ORDER BY n.id ASC LIMIT ?",
        [lastId, BATCH],
      );
      const rawRows = rows as RowDataPacket[];
      if (rawRows.length === 0) break;

      const noticeIds = rawRows.map((r) => String(r.notice_id));
      const ids = rawRows.map((r) => Number(r.id));
      const [unspscMap, translationsMap, preciseMap] = await Promise.all([
        loadUnspscByNoticeIds(pool, noticeIds),
        loadTranslationsByNoticeIds(pool, ids),
        loadPreciseByNoticeIds(pool, noticeIds),
      ]);

      const wideRows = rawRows.map((r) => buildWideRow(
        r, aliasMap,
        unspscMap.get(String(r.notice_id)),
        translationsMap.get(Number(r.id)),
        preciseMap.get(String(r.notice_id)),
      ));
      const synced = await upsertWideRows(pool, wideRows);
      totalSynced += synced;
      lastId = rawRows[rawRows.length - 1].id;

      if (rawRows.length < BATCH) break;
    }

    const elapsed = Date.now() - start;
    return { synced: totalSynced, elapsed };
  } catch (err) {
    console.error("[wide-table] 全量回填失败:", (err as Error).message);
    return { synced: 0, elapsed: Date.now() - start };
  }
}

/**
 * 增量同步（仅拉取新行，不含 deadline 对账）
 */
export async function incrementalWideSync(
  pool: Pool,
  watermark: number,
): Promise<{ synced: number; newWatermark: number }> {
  const aliasMap = await loadAliasMap(pool);

  try {
    const [newRows] = await pool.query(
      WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + " WHERE n.id > ? AND " + PLATFORM_PUBLISHED_ONLY + " ORDER BY n.id ASC LIMIT 5000",
      [watermark],
    );

    const allRaw = newRows as RowDataPacket[];
    if (allRaw.length === 0) return { synced: 0, newWatermark: watermark };

    const noticeIds = allRaw.map((r) => String(r.notice_id));
    const ids = allRaw.map((r) => Number(r.id));
    const [unspscMap, translationsMap, preciseMap] = await Promise.all([
      loadUnspscByNoticeIds(pool, noticeIds),
      loadTranslationsByNoticeIds(pool, ids),
      loadPreciseByNoticeIds(pool, noticeIds),
    ]);

    const wideRows = allRaw.map((r) => buildWideRow(
      r, aliasMap,
      unspscMap.get(String(r.notice_id)),
      translationsMap.get(Number(r.id)),
      preciseMap.get(String(r.notice_id)),
    ));
    const synced = await upsertWideRows(pool, wideRows);
    // [阶段0 A4-1] 宽表已更新：失效搜索结果缓存。外部 CRM 管道的新数据经本函数入库，
    // 此前仅在 syncWideIds 级联处失效缓存，导致新公告最长 5 分钟内不出现在带缓存的搜索结果中
    if (synced > 0) invalidateSearchCache();
    const newWatermark = allRaw[allRaw.length - 1].id;
    return { synced, newWatermark };
  } catch (err) {
    console.warn("[wide-table] 增量同步失败:", (err as Error).message);
    return { synced: 0, newWatermark: watermark };
  }
}

/**
 * 按 ID 精确同步
 */
export async function syncWideIds(pool: Pool, ids: number[]): Promise<{ synced: number }> {
  if (ids.length === 0) return { synced: 0 };
  const aliasMap = await loadAliasMap(pool);

  try {
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await pool.query(
      WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + ` WHERE n.id IN (${placeholders}) AND ` + PLATFORM_PUBLISHED_ONLY + " ORDER BY n.id ASC",
      ids,
    );
    const noticeIds = (rows as RowDataPacket[]).map((r) => String(r.notice_id));
    const rowIds = (rows as RowDataPacket[]).map((r) => Number(r.id));
    const [unspscMap, translationsMap, preciseMap] = await Promise.all([
      loadUnspscByNoticeIds(pool, noticeIds),
      loadTranslationsByNoticeIds(pool, rowIds),
      loadPreciseByNoticeIds(pool, noticeIds),
    ]);
    const wideRows = (rows as RowDataPacket[]).map((r) => buildWideRow(
      r, aliasMap,
      unspscMap.get(String(r.notice_id)),
      translationsMap.get(Number(r.id)),
      preciseMap.get(String(r.notice_id)),
    ));
    const synced = await upsertWideRows(pool, wideRows);
    // 宽表已更新：失效搜索结果缓存，确保下次列表请求读到最新译文
    if (synced > 0) invalidateSearchCache();
    // 级联同步 Meilisearch：宽表更新后必须同步到索引，避免数据断链。
    // 修复 G1/G4/G5：不健康时先尝试 tryRecover 自愈，仍失败则标记重建 + 入重试队列，
    // 不再静默丢弃——确保"宽表有数据但索引搜不到"的问题可自愈。
    if (synced > 0) {
      if (!isMeiliHealthy()) {
        await tryRecover().catch(() => false);
      }
      if (isMeiliHealthy()) {
        void syncNoticeIds(pool, ids).then((r) => {
          const processed = r.synced + r.deleted;
          logSyncCascade("meili", ids.length, processed > 0 ? "ok" : "fail");
          if (processed < ids.length) enqueueRetry(ids);
        }).catch((err) => {
          console.warn("[wide-table] Meilisearch 级联同步失败:", (err as Error).message);
          logSyncCascade("meili", ids.length, "fail");
          enqueueRetry(ids);
        });
      } else {
        // 不健康且恢复失败：标记重建 + 入重试队列（不静默丢弃）
        logSyncCascade("meili", ids.length, "retry");
        requestIndexRebuild("cascade-skipped-unhealthy");
        enqueueRetry(ids);
      }
    }
    return { synced };
  } catch (err) {
    console.warn("[wide-table] 按ID同步失败:", (err as Error).message);
    return { synced: 0 };
  }
}

// 宽表就绪检查已抽至无依赖叶子模块（A2 解环），此处重导出维持调用方兼容
export { isWideTableReady } from "./wide-table-readiness";

/**
 * 启动宽表增量同步定时器
 *
 * 三个独立定时器：
 * - 增量同步（5 秒）：拉取新行写入宽表（主键水位轻扫描，[阶段0 S3] 从 30 秒缩短至 5 秒）
 * - deadline 对账（60 秒）：检测旧行 deadline_sec 陈旧并修复
 * - 全量对账（5 分钟）：ghost 行清理 + is_featured 同步
 *
 * 分离原因：
 * - deadline_sec 变更来自外部数据管道（批量导入），日常极少发生
 * - ghost 行清理和 is_featured 对账需要 JOIN 查询，降频执行避免资源浪费
 */
export function startWideTableSync(pool: Pool, options: { intervalMs?: number; reconcileIntervalMs?: number; fullReconcileIntervalMs?: number } = {}): () => void {
  const intervalMs = options.intervalMs ?? 5 * 1000;
  const reconcileIntervalMs = options.reconcileIntervalMs ?? 60 * 1000;
  const fullReconcileIntervalMs = options.fullReconcileIntervalMs ?? 5 * 60 * 1000; // 5 分钟
  let stopped = false;
  let watermark = 0;
  let initDone = false;
  let backfillAllowed = false;
  const stopFns: Array<() => void> = [];

  // 初始化（水位定格 / 首次全量回填）。
  // 幂等且可重试：启动瞬间 DB 抖动只影响首轮回填，由增量定时器按周期自动重试，
  // 绝不允许初始化失败导致定时器永不注册（静默永久停摆）。
  const ensureInit = async (): Promise<void> => {
    if (initDone) return;
    try {
      const ready = await isWideTableReady(pool);
      if (!ready) {
        // 全量回填延迟 30 秒执行，避免与启动阶段的 API 请求争抢数据库连接。
        // 宽表为空时增量同步无法工作，但 API 查询走主表不受影响，优先保障 API 可用。
        if (!backfillAllowed) {
          console.log("[wide-table] 宽表未就绪，全量回填等待中（API 优先）");
          return;
        }
        const result = await fullBackfill(pool);
        if (result.synced > 0) {
          const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
          watermark = Number((maxRows as RowDataPacket[])[0]?.max_id || 0);
        }
      } else {
        const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
        watermark = Number((maxRows as RowDataPacket[])[0]?.max_id || 0);
      }
      initDone = true;
    } catch (err) {
      console.error("[wide-table] 初始化失败（下个周期自动重试）:", (err as Error).message);
    }
  };

  // 30 秒后允许全量回填，给启动阶段的 API 请求留出窗口
  const backfillTimer = setTimeout(() => { backfillAllowed = true; }, 30 * 1000);
  stopFns.push(() => clearTimeout(backfillTimer));

  // 定时器 1：增量同步（拉取新行；初始化未完成时先补初始化）
  const syncTimer = setInterval(async () => {
    if (stopped) return;
    try {
      await ensureInit();
      const { newWatermark } = await incrementalWideSync(pool, watermark);
      watermark = newWatermark;
    } catch (err) {
      console.warn("[wide-table] 增量同步异常:", (err as Error).message);
    }
  }, intervalMs);
  stopFns.push(() => clearInterval(syncTimer));

  /**
   * 级联到 Meilisearch：不健康先自愈，仍失败则标记重建 + 入重试队列（不静默丢弃）。
   * 仅用于不经 syncWideIds 的删除类变更（如 ghost 行已删宽表行）；
   * syncWideIds 内部已自带同语义的级联，不要重复调用。
   */
  const cascadeToMeili = (ids: number[], label: string) => {
    if (ids.length === 0) return;
    void (async () => {
      if (!isMeiliHealthy()) await tryRecover().catch(() => false);
      if (!isMeiliHealthy()) {
        logSyncCascade("meili", ids.length, "retry");
        requestIndexRebuild("cascade-skipped-unhealthy");
        enqueueRetry(ids);
        return;
      }
      try {
        const r = await syncNoticeIds(pool, ids);
        const processed = r.synced + r.deleted;
        logSyncCascade("meili", ids.length, processed > 0 ? "ok" : "fail");
        if (processed < ids.length) enqueueRetry(ids);
      } catch (err) {
        console.warn(`[wide-table] ${label} Meilisearch 级联同步失败:`, (err as Error).message);
        logSyncCascade("meili", ids.length, "fail");
        enqueueRetry(ids);
      }
    })();
  };

  // 定时器 2：deadline_sec 漂移（分钟级，搜索活跃度过滤依赖它；修复仍走 syncWideIds）
  const reconcileTimer = setInterval(async () => {
    if (stopped) return;
    try {
      const driftIds = await detectDeadlineDrift(pool);
      if (driftIds.length > 0) await syncWideIds(pool, driftIds);
    } catch (err) {
      console.warn("[wide-table] deadline 对账异常:", (err as Error).message);
    }
  }, reconcileIntervalMs);
  stopFns.push(() => clearInterval(reconcileTimer));

  // 定时器 3：全量对账（平台可见性集合差 + ghost 清理 + 源指纹轮转）
  const fullReconcileTimer = setInterval(async () => {
    if (stopped) return;
    try {
      // 1) 平台公告状态漂移：先修可见性再做 ghost 清理，避免同一行两路径争抢删除
      const { toSync: platformSyncIds, toPurge: platformPurgeIds } = await detectPlatformStatusDrift(pool);
      if (platformPurgeIds.length > 0) await purgeNoticeSearch(pool, platformPurgeIds);
      if (platformSyncIds.length > 0) await syncWideIds(pool, platformSyncIds);

      // 2) Ghost 行清理（主表已删除 / 平台行转为不可见）
      const ghostIds = await reconcileGhostRows(pool);

      // 3) 源指纹轮转：内容落后于输入的行（取代旧的 5 段手写 UPDATE）
      const driftIds = await detectWideFingerprintDrift(pool);
      if (driftIds.length > 0) await syncWideIds(pool, driftIds);

      if (ghostIds.length > 0 || platformSyncIds.length > 0 || platformPurgeIds.length > 0 || driftIds.length > 0) {
        console.log(
          `[wide-table] 全量对账：ghost=${ghostIds.length} 平台补建=${platformSyncIds.length} ` +
          `平台清除=${platformPurgeIds.length} 指纹重建=${driftIds.length}`,
        );
      }
      // ghost 行已由 reconcileGhostRows 直接删除，不走 syncWideIds（主表行为不存在），
      // 因此需单独级联以删除索引文档；平台补建与指纹重建已由 syncWideIds 级联。
      cascadeToMeili(ghostIds, "ghost-cleanup");
    } catch (err) {
      console.warn("[wide-table] 全量对账异常:", (err as Error).message);
    }
  }, fullReconcileIntervalMs);
  stopFns.push(() => clearInterval(fullReconcileTimer));

  return () => {
    stopped = true;
    stopFns.forEach((fn) => fn());
    stopFns.length = 0;
  };
}
