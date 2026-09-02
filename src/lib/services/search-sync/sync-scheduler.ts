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
import { logSyncCascade } from "../search-orchestrator/metrics";
import { requestIndexRebuild } from "../search-orchestrator/rebuild-trigger";
import { invalidateUnifiedSearchCache } from "../search-orchestrator/index";
import {
  WIDE_SYNC_SELECT, WIDE_SYNC_JOIN,
  loadAliasMap, loadTranslationsByNoticeIds, loadUnspscByNoticeIds, loadPreciseByNoticeIds,
  buildWideRow, upsertWideRows,
} from "./wide-row-builder";
import {
  reconcileDeadlineSec, reconcileGhostRows, reconcileIsFeatured,
  reconcileTranslations, reconcilePreciseCodes, reconcileContentDrift,
} from "./wide-row-reconcile";

/**
 * 全量回填宽表
 */
export async function fullBackfill(pool: Pool): Promise<{ synced: number; elapsed: number }> {
  const start = Date.now();
  const aliasMap = await loadAliasMap(pool);
  
  let lastId = 0;
  let totalSynced = 0;
  const BATCH = 500;

  try {
    while (true) {
      const [rows] = await pool.query(
        WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + " WHERE n.id > ? ORDER BY n.id ASC LIMIT ?",
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
      WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + " WHERE n.id > ? ORDER BY n.id ASC LIMIT 5000",
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
    if (synced > 0) invalidateUnifiedSearchCache();
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
      WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + ` WHERE n.id IN (${placeholders}) ORDER BY n.id ASC`,
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
    if (synced > 0) invalidateUnifiedSearchCache();
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

/**
 * 检查宽表是否已就绪
 */
let _wideTableReadyCache: { ready: boolean; expires: number } | null = null;
const WIDE_TABLE_READY_CACHE_TTL = 60 * 1000; // 1 分钟

export async function isWideTableReady(pool: Pool): Promise<boolean> {
  if (_wideTableReadyCache && _wideTableReadyCache.expires > Date.now()) {
    return _wideTableReadyCache.ready;
  }
  try {
    const [rows] = await pool.query("SELECT 1 FROM crm_notice_search LIMIT 1");
    const ready = (rows as RowDataPacket[]).length > 0;
    _wideTableReadyCache = { ready, expires: Date.now() + WIDE_TABLE_READY_CACHE_TTL };
    return ready;
  } catch {
    _wideTableReadyCache = { ready: false, expires: Date.now() + WIDE_TABLE_READY_CACHE_TTL };
    return false;
  }
}

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
  const stopFns: Array<() => void> = [];

  void (async () => {
    try {
      const ready = await isWideTableReady(pool);
      if (!ready) {
        const result = await fullBackfill(pool);
        if (result.synced > 0) {
          const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
          watermark = Number((maxRows as RowDataPacket[])[0]?.max_id || 0);
        }
      } else {
        const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
        watermark = Number((maxRows as RowDataPacket[])[0]?.max_id || 0);
      }

      // 定时器 1：增量同步（拉取新行）
      const syncTimer = setInterval(async () => {
        if (stopped) return;
        try {
          const { newWatermark } = await incrementalWideSync(pool, watermark);
          watermark = newWatermark;
        } catch (err) {
          console.warn("[wide-table] 增量同步异常:", (err as Error).message);
        }
      }, intervalMs);
      stopFns.push(() => clearInterval(syncTimer));

      // 定时器 2：deadline_sec 对账（独立于增量同步，降频执行）
      const reconcileTimer = setInterval(async () => {
        if (stopped) return;
        try {
          const reconciledIds = await reconcileDeadlineSec(pool);
          if (reconciledIds.length > 0) {
            if (!isMeiliHealthy()) await tryRecover().catch(() => false);
            if (isMeiliHealthy()) {
              void syncNoticeIds(pool, reconciledIds).then((r) => {
                const processed = r.synced + r.deleted;
                logSyncCascade("meili", reconciledIds.length, processed > 0 ? "ok" : "fail");
                if (processed < reconciledIds.length) enqueueRetry(reconciledIds);
              }).catch((err) => {
                console.warn("[wide-table] Meilisearch 级联同步失败:", (err as Error).message);
                logSyncCascade("meili", reconciledIds.length, "fail");
                enqueueRetry(reconciledIds);
              });
            } else {
              logSyncCascade("meili", reconciledIds.length, "retry");
              requestIndexRebuild("cascade-skipped-unhealthy");
              enqueueRetry(reconciledIds);
            }
          }
        } catch (err) {
          console.warn("[wide-table] deadline 对账异常:", (err as Error).message);
        }
      }, reconcileIntervalMs);
      stopFns.push(() => clearInterval(reconcileTimer));

      // 定时器 3：全量对账（ghost 行清理 + is_featured 同步 + 译文对账）
      const fullReconcileTimer = setInterval(async () => {
        if (stopped) return;
        try {
          // Ghost 行清理
          const ghostIds = await reconcileGhostRows(pool);
          // is_featured 对账
          const featuredIds = await reconcileIsFeatured(pool);
          // 译文对账：宽表 title_zh 与翻译表 title_tr 不一致的行重新同步
          const translationIds = await reconcileTranslations(pool);
          // precise 对账：专人更新 candidates 后跟随重算
          const preciseIds = await reconcilePreciseCodes(pool);
          // P1-18 内容漂移对账：主表 title/description 变更后宽表滞后修复
          const contentDriftIds = await reconcileContentDrift(pool);

          // 合并变更 ID 并同步到 Meilisearch
          const allChangedIds = [...new Set([...ghostIds, ...featuredIds, ...translationIds, ...preciseIds, ...contentDriftIds])];
          if (allChangedIds.length > 0) {
            if (!isMeiliHealthy()) await tryRecover().catch(() => false);
            if (isMeiliHealthy()) {
              void syncNoticeIds(pool, allChangedIds).then((r) => {
                const processed = r.synced + r.deleted;
                logSyncCascade("meili", allChangedIds.length, processed > 0 ? "ok" : "fail");
                if (processed < allChangedIds.length) enqueueRetry(allChangedIds);
              }).catch((err) => {
                console.warn("[wide-table] Meilisearch 级联同步失败:", (err as Error).message);
                logSyncCascade("meili", allChangedIds.length, "fail");
                enqueueRetry(allChangedIds);
              });
            } else {
              logSyncCascade("meili", allChangedIds.length, "retry");
              requestIndexRebuild("cascade-skipped-unhealthy");
              enqueueRetry(allChangedIds);
            }
          }
        } catch (err) {
          console.warn("[wide-table] 全量对账异常:", (err as Error).message);
        }
      }, fullReconcileIntervalMs);
      stopFns.push(() => clearInterval(fullReconcileTimer));
    } catch (err) {
      console.error("[wide-table] 初始化失败（静默降级）:", (err as Error).message);
    }
  })();

  return () => {
    stopped = true;
    stopFns.forEach((fn) => fn());
    stopFns.length = 0;
  };
}
