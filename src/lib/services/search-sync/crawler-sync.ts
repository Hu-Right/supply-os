/**
 * 爬虫库 → 主表 增量同步（应用内）
 * Crawler source DB → main tables incremental sync (in-app)
 *
 * @module lib/services/search-sync/crawler-sync
 * @description 移植自 scripts/daily-sync.cjs，改为在 Next 进程内运行：读源库 getSourcePool()、
 *              写主库 getPool()，按「父表先于子表」顺序增量 upsert，水位线持久化到
 *              crm_sync_watermark 控制表（仅确认写入后推进，崩溃从断点续）。
 *              纯 SQL 构件（转义/ODKU/WHERE/水位线）在叶子模块 crawler-sync-sql.ts（可单测）。
 *
 *              与 .cjs 的关键差异（并入应用必须处理）：
 *              1. **不关闭 FOREIGN_KEY_CHECKS**（主池全站共享，关它会影响其他请求）
 *                 → 改为按父→子表顺序同步 + ODKU 幂等；
 *              2. **收集本轮 crm_bid_notices 变更 id**，交由调度器在主表全部写完后
 *                 级联宽表（syncWideIds 内部再级联 Meili），实现「主表完整 → 才更新宽表」
 *                 的同进程串行顺序。
 *
 *              ⚠️ 源库值经 escapeVal 拼进批量 INSERT 字符串（沿用 .cjs 语义）：数据源为
 *              受信任的内网爬虫库，非终端用户输入；列名来自 information_schema 且反引号包裹。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getSourcePool } from "@/lib/db/source-pool";
import {
  SYNC_TABLES, NOTICE_TABLE,
  escapeVal, buildOdkuClause, buildIncrementalWhere, buildWatermark,
  NUMERIC_TYPES, NON_DESTRUCTIVE_COLUMNS,
  type Watermark,
} from "./crawler-sync-sql";

// 纯构件与常量再导出（供调度器 / 集成测试从本模块统一取用）
export { SYNC_TABLES, NOTICE_TABLE } from "./crawler-sync-sql";
export type { Watermark } from "./crawler-sync-sql";

const BATCH_SIZE = 200;

interface ColMeta { COLUMN_NAME: string; COLUMN_KEY: string; DATA_TYPE: string; }
const _colCache = new Map<string, ColMeta[]>();

async function getTableColumns(pool: Pool, table: string, ns: string): Promise<ColMeta[]> {
  const cacheKey = `${ns}:${table}`;
  const hit = _colCache.get(cacheKey);
  if (hit) return hit;
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_KEY, DATA_TYPE
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND EXTRA NOT LIKE '%GENERATED%'
     ORDER BY ordinal_position`,
    [table],
  );
  const cols = columns as unknown as ColMeta[];
  _colCache.set(cacheKey, cols);
  return cols;
}

/** 读取全部表水位线（控制表缺失/未迁移时返回空表 → 视为从 0 全量，幂等安全） */
export async function loadWatermarks(target: Pool): Promise<Map<string, Watermark>> {
  const map = new Map<string, Watermark>();
  try {
    const [rows] = await target.query("SELECT table_name, id_wm, time_wm FROM crm_sync_watermark");
    for (const r of rows as RowDataPacket[]) {
      map.set(String(r.table_name), { id: Number(r.id_wm) || 0, time: r.time_wm == null ? null : String(r.time_wm) });
    }
  } catch {
    // 控制表不存在（迁移未跑）：空水位线，首轮全量
  }
  return map;
}

/** 落库单表水位线（仅确认写入后调用） */
export async function saveWatermark(target: Pool, table: string, wm: Watermark): Promise<void> {
  await target.query(
    `INSERT INTO crm_sync_watermark (table_name, id_wm, time_wm) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id_wm = VALUES(id_wm), time_wm = VALUES(time_wm)`,
    [table, wm.id, wm.time],
  );
}

export interface SyncTableResult {
  synced: number;
  newWm: Watermark;
  /** 仅 NOTICE_TABLE 有值：本批成功 upsert 的主键 id，供级联宽表 */
  changedIds: number[];
}

/**
 * 单表增量同步：keyset 分页拉取源库变更 → 批量 ODKU 写目标 → 每批成功后落水位线。
 * @param onWatermark 每批成功后的水位线回调（用于崩溃续传）
 */
export async function syncTable(
  source: Pool,
  target: Pool,
  table: string,
  wm: Watermark,
  onWatermark?: (wm: Watermark) => Promise<void>,
): Promise<SyncTableResult> {
  const columns = await getTableColumns(source, table, "source");
  const targetColumns = await getTableColumns(target, table, "target");
  const targetColSet = new Set(targetColumns.map((c) => c.COLUMN_NAME));
  // 源/目标 schema 漂移：只同步交集列，缺失列跳过，避免 Unknown column 中断整轮
  const missingCols = columns.map((c) => c.COLUMN_NAME).filter((n) => !targetColSet.has(n));
  if (missingCols.length > 0) {
    console.warn(`[crawler-sync] ${table}: 目标库缺少列 [${missingCols.join(", ")}]，本次跳过这些列`);
  }
  const effectiveColumns = columns.filter((c) => targetColSet.has(c.COLUMN_NAME));
  const colNames = effectiveColumns.map((c) => c.COLUMN_NAME);
  const colTypes: Record<string, string> = {};
  effectiveColumns.forEach((c) => { colTypes[c.COLUMN_NAME] = c.DATA_TYPE; });
  const pkCols = effectiveColumns.filter((c) => c.COLUMN_KEY === "PRI").map((c) => c.COLUMN_NAME);
  if (pkCols.length === 0) {
    console.warn(`[crawler-sync] ${table}: 无主键，跳过`);
    return { synced: 0, newWm: wm, changedIds: [] };
  }

  const pkCol = pkCols[0];
  const hasUpdateTime = colNames.includes("update_time");
  const utIsNumeric = hasUpdateTime && NUMERIC_TYPES.has(colTypes["update_time"]);
  const colList = colNames.map((c) => `\`${c}\``).join(", ");
  const keepCols = new Set(NON_DESTRUCTIVE_COLUMNS[table] || []);
  const updateClause = buildOdkuClause(colNames, pkCols, colTypes, keepCols, pkCol);
  const baseWhere = buildIncrementalWhere(pkCol, wm.id, wm.time, hasUpdateTime, utIsNumeric);
  const baseWhereBody = baseWhere.replace(/^WHERE \((.*)\)$/, "$1"); // 供 keyset 追加 AND 条件

  const [countRows] = await source.query(`SELECT COUNT(*) AS cnt FROM \`${table}\` ${baseWhere}`);
  const newCount = Number((countRows as RowDataPacket[])[0]?.cnt || 0);
  if (newCount === 0) return { synced: 0, newWm: wm, changedIds: [] };

  let synced = 0;
  let maxId = wm.id;
  let maxUpdateTime: string | null = utIsNumeric
    ? (wm.time && Number(wm.time) > 0 ? wm.time : null)
    : (wm.time || null);
  const changedIds: number[] = [];
  const collectIds = table === NOTICE_TABLE;

  // keyset 分页：按主键递进，避免深 OFFSET 让源库越扫越慢
  let lastPk: number | null = null;
  while (synced < newCount) {
    const conds = [baseWhereBody, lastPk !== null ? `\`${pkCol}\` > ${lastPk}` : null].filter(Boolean);
    const pageWhere = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const [rows] = await source.query(
      `SELECT * FROM \`${table}\` ${pageWhere} ORDER BY \`${pkCol}\` ASC LIMIT ${BATCH_SIZE}`,
    );
    const batch = rows as RowDataPacket[];
    if (batch.length === 0) break;

    const valueRows = batch.map((row) =>
      `(${colNames.map((c) => escapeVal(row[c], colTypes[c])).join(", ")})`,
    );
    const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${valueRows.join(",")} ON DUPLICATE KEY UPDATE ${updateClause}`;
    await target.query(sql);

    synced += batch.length;
    const lastId = Number(batch[batch.length - 1][pkCol]);
    if (lastId > maxId) maxId = lastId;
    lastPk = lastId;

    if (collectIds) {
      for (const row of batch) {
        const id = Number(row[pkCol]);
        if (Number.isFinite(id) && id > 0) changedIds.push(id);
      }
    }

    if (hasUpdateTime) {
      for (const row of batch) {
        if (!row.update_time) continue;
        if (utIsNumeric) {
          // 数值列本身就是 Unix 秒，直接取最大值（不能 new Date(秒) 被当毫秒解析成 1970）
          const val = Number(row.update_time);
          const cur = maxUpdateTime ? Number(maxUpdateTime) : 0;
          if (Number.isFinite(val) && val > cur) maxUpdateTime = String(val);
        } else {
          const raw = row.update_time;
          const ut = raw instanceof Date
            ? `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")} ${String(raw.getHours()).padStart(2, "0")}:${String(raw.getMinutes()).padStart(2, "0")}:${String(raw.getSeconds()).padStart(2, "0")}`
            : String(raw).slice(0, 19);
          if (!maxUpdateTime || ut > maxUpdateTime) maxUpdateTime = ut;
        }
      }
    }

    // 每批成功写入后落水位线：崩溃后下一轮从断点续（完整性保障）
    const batchWm = buildWatermark(hasUpdateTime, maxId, maxUpdateTime);
    if (onWatermark) await onWatermark(batchWm);
  }

  return { synced, newWm: buildWatermark(hasUpdateTime, maxId, maxUpdateTime), changedIds };
}

export interface CrawlerSyncResult {
  skipped: boolean;
  totalSynced: number;
  changedNoticeIds: number[];
  perTable: Record<string, number>;
}

/**
 * 跑一轮完整爬虫同步：按 SYNC_TABLES 顺序同步全部主表，返回公告变更 id 供级联。
 * 源库未配置时 skipped=true（不报错，不影响其他功能）。
 */
export async function runCrawlerSyncOnce(target: Pool): Promise<CrawlerSyncResult> {
  const source = getSourcePool();
  if (!source) return { skipped: true, totalSynced: 0, changedNoticeIds: [], perTable: {} };

  const wms = await loadWatermarks(target);
  let totalSynced = 0;
  const changedNoticeIds: number[] = [];
  const perTable: Record<string, number> = {};

  for (const table of SYNC_TABLES) {
    const wm = wms.get(table) ?? { id: 0, time: null };
    const result = await syncTable(source, target, table, wm, (batchWm) => saveWatermark(target, table, batchWm));
    // 兜底：本轮结束再落一次最终水位（与每批一致，幂等）
    await saveWatermark(target, table, result.newWm);
    wms.set(table, result.newWm);
    perTable[table] = result.synced;
    totalSynced += result.synced;
    if (table === NOTICE_TABLE) changedNoticeIds.push(...result.changedIds);
  }

  return { skipped: false, totalSynced, changedNoticeIds, perTable };
}
