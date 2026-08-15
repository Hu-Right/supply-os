/**
 * 宽表同步调度器
 * Wide Table Sync Scheduler
 *
 * @module server/services/search-sync/sync-scheduler
 * @description 负责宽表同步的调度逻辑：全量回填、增量同步、按 ID 同步、就绪检查、定时器管理。
 *              数据构建细节由 wide-row-builder.ts 提供，本文件仅关心同步时机和流程编排。
 */
import type { Pool } from "mysql2/promise";
import { syncNoticeIds, isHealthy as isMeiliHealthy } from "../meilisearch";
import {
  WIDE_SYNC_SELECT, WIDE_SYNC_JOIN,
  loadAliasMap, loadTranslationsByNoticeIds, loadUnspscByNoticeIds,
  buildWideRow, upsertWideRows, reconcileDeadlineSec,
} from "./wide-row-builder";

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
      const rawRows = rows as any[];
      if (rawRows.length === 0) break;

      const noticeIds = rawRows.map((r) => String(r.notice_id));
      const ids = rawRows.map((r) => Number(r.id));
      const [unspscMap, translationsMap] = await Promise.all([
        loadUnspscByNoticeIds(pool, noticeIds),
        loadTranslationsByNoticeIds(pool, ids),
      ]);

      const wideRows = rawRows.map((r) => buildWideRow(
        r, aliasMap,
        unspscMap.get(String(r.notice_id)),
        translationsMap.get(Number(r.id)),
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

    const allRaw = newRows as any[];
    if (allRaw.length === 0) return { synced: 0, newWatermark: watermark };

    const noticeIds = allRaw.map((r) => String(r.notice_id));
    const ids = allRaw.map((r) => Number(r.id));
    const [unspscMap, translationsMap] = await Promise.all([
      loadUnspscByNoticeIds(pool, noticeIds),
      loadTranslationsByNoticeIds(pool, ids),
    ]);

    const wideRows = allRaw.map((r) => buildWideRow(
      r, aliasMap,
      unspscMap.get(String(r.notice_id)),
      translationsMap.get(Number(r.id)),
    ));
    const synced = await upsertWideRows(pool, wideRows);
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
    const noticeIds = (rows as any[]).map((r) => String(r.notice_id));
    const rowIds = (rows as any[]).map((r) => Number(r.id));
    const [unspscMap, translationsMap] = await Promise.all([
      loadUnspscByNoticeIds(pool, noticeIds),
      loadTranslationsByNoticeIds(pool, rowIds),
    ]);
    const wideRows = (rows as any[]).map((r) => buildWideRow(
      r, aliasMap,
      unspscMap.get(String(r.notice_id)),
      translationsMap.get(Number(r.id)),
    ));
    const synced = await upsertWideRows(pool, wideRows);
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
    const ready = (rows as any[]).length > 0;
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
 * 两个独立定时器：
 * - 增量同步（30 秒）：拉取新行写入宽表
 * - deadline 对账（60 秒）：检测旧行 deadline_sec 陈旧并修复
 *
 * 分离原因：deadline_ts 变更来自外部数据管道（批量导入），日常极少发生。
 * 对账需要 108K×108K JOIN，每 10 秒执行一次浪费资源；60 秒足够。
 */
export function startWideTableSync(pool: Pool, options: { intervalMs?: number; reconcileIntervalMs?: number } = {}): () => void {
  const intervalMs = options.intervalMs ?? 30 * 1000;
  const reconcileIntervalMs = options.reconcileIntervalMs ?? 60 * 1000;
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
          watermark = Number((maxRows as any[])[0]?.max_id || 0);
        }
      } else {
        const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
        watermark = Number((maxRows as any[])[0]?.max_id || 0);
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
          if (reconciledIds.length > 0 && isMeiliHealthy()) {
            void syncNoticeIds(pool, reconciledIds).catch((err) => {
              console.warn("[wide-table] Meilisearch 级联同步失败:", (err as Error).message);
            });
          }
        } catch (err) {
          console.warn("[wide-table] deadline 对账异常:", (err as Error).message);
        }
      }, reconcileIntervalMs);
      stopFns.push(() => clearInterval(reconcileTimer));
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
