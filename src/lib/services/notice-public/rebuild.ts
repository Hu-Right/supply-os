/**
 * 服务表应用内增量重建（管道第一棒）。
 *
 * 管道翻转后的执行顺序：主表同步 → 本函数（①归一层）→ 宽表级联（②投影层，内部再级联
 * Meili）。此前 ① 是 ops 脚本 spawn 第三棒，生产 standalone 缺脚本即静默跳过——②改为
 * 读 ① 之后这不可接受，故入应用内。选行/构建/写入/清理全部委托 build.ts（唯一写入者）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  buildPublicRow, deletePublicRows, fetchPublicInputRows,
  loadPublicBuildContext, selectChangedPublicIds, selectPublicGhostIds, upsertPublicRows,
} from "./build";
import type { PublicBuildContext } from "./build";
import { syncBuyerCandidates } from "../buyer/candidates";

export interface RebuildResult {
  selected: number;
  written: number;
  pruned: number;
  /** 本轮实际重建的 notice_pk（供检索侧按 id 增量同步 Meili；宽表退役后不再有第二跳） */
  ids: number[];
  /** 未执行的原因（单飞中 / 节流窗口内） */
  skipped?: "running" | "throttled";
}

const REBUILD_CHUNK = 500;
/** 节流窗口：对账定时器高频触发时防止全库不等式选行刷屏；手动兜底脚本 force 调用同样受此约束（小时级，无感） */
const MIN_INTERVAL_MS = Number(process.env.NOTICE_PUBLIC_REBUILD_MIN_INTERVAL_MS || 10 * 60 * 1000);

let _running = false;
let _lastRunAt = 0;

/**
 * 按一批 notice_pk 重建服务表行（构建 + 写入，含单行坏数据隔离）。
 * 选行由调用方决定：常规增量走 selectChangedPublicIds，buyer 数据变更回填走显式 id 列表。
 */
async function writeRowsByIds(pool: Pool, ctx: PublicBuildContext, ids: number[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < ids.length; i += REBUILD_CHUNK) {
    const chunk = ids.slice(i, i + REBUILD_CHUNK);
    const input = await fetchPublicInputRows(pool, chunk);
    const params: unknown[][] = [];
    for (const r of input.rows) {
      const row = buildPublicRow(r, ctx, input);
      if (row) params.push(row);
    }
    try {
      written += await upsertPublicRows(pool, params);
    } catch (chunkErr) {
      // [2026-10-28 事故加固] 整块 all-or-nothing 会让单行坏数据毒化全部选中行：
      // 同一批次每轮都在同一块上失败，~1.2 万行永远写不进服务表。降级逐行落盘，
      // 隔离坏行并留痕（notice_pk = 行首列），修复数据后下轮自动补齐。
      for (const row of params) {
        try {
          written += await upsertPublicRows(pool, [row]);
        } catch (rowErr) {
          console.error(`[notice-public] 单行写入失败（已隔离，notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[notice-public] 块写入失败已逐行降级（chunk ${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
  }
  return written;
}

/**
 * 增量拾取「新到达的中文译文」对应的公告 id。
 *
 * 2026-11-26：后台翻译器（intelligence-daily）只写 `notice_translations`（并直更宽表），
 * 从不写服务表 ⇒ `title_cn/description_cn` 永远是空的（实测 6.3 万条）。这里用
 * `notice_translations.id` 主键水位（存 `sync_watermark`）增量拾取，避免按 created_at
 * 全表扫描（实测 26s/轮）。水位持久化 ⇒ 停机期间产生的译文重启后照样补上。
 *
 * 首次运行只把水位初始化到当前 MAX(id)：存量缺口由一次性回填脚本补齐，
 * 不在这里扫 100 万行历史译文。
 */
const TRANSLATION_WATERMARK = "notice_translations_zh";
const TRANSLATION_BATCH = 5000;

/** @internal 导出仅为单测（水位语义：只返回待处理 id 与下一水位，前移由调用方在写入成功后执行） */
export async function selectNewTranslationNoticeIds(
  pool: Pool,
): Promise<{ ids: number[]; nextWatermark: number | null }> {
  const [wmRows] = await pool.query<RowDataPacket[]>(
    "SELECT id_wm FROM sync_watermark WHERE table_name = ?",
    [TRANSLATION_WATERMARK],
  );
  if (wmRows.length === 0) {
    const [maxRows] = await pool.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(id), 0) AS max_id FROM notice_translations WHERE lang='zh'",
    );
    const maxId = Number(maxRows[0]?.max_id ?? 0);
    await pool.execute(
      "INSERT INTO sync_watermark (table_name, id_wm) VALUES (?, ?) ON DUPLICATE KEY UPDATE id_wm = VALUES(id_wm)",
      [TRANSLATION_WATERMARK, maxId],
    );
    console.log(`[notice-public] 译文水位初始化：${TRANSLATION_WATERMARK}=${maxId}（存量由回填脚本负责）`);
    return { ids: [], nextWatermark: null };
  }
  const watermark = Number(wmRows[0]?.id_wm ?? 0);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.notice_id
       FROM notice_translations t
       JOIN notice_public p ON p.notice_pk = t.notice_id
      WHERE t.lang = 'zh'
        AND t.id > ?
        AND ((t.title_tr IS NOT NULL AND t.title_tr <> '')
          OR (t.description_tr IS NOT NULL AND t.description_tr <> ''))
      ORDER BY t.id ASC
      LIMIT ?`,
    [watermark, TRANSLATION_BATCH],
  );
  if (rows.length === 0) return { ids: [], nextWatermark: null };
  const ids = rows.map((r) => Number(r.notice_id)).filter((id) => Number.isFinite(id) && id > 0);
  return { ids, nextWatermark: Number(rows[rows.length - 1]?.id ?? watermark) };
}

/**
 * 单飞 + 节流的 --changed --apply [--prune] 等价物。任何异常向上抛，由调用方告警降级
 * （宽表投影读到旧归一值时，指纹对账会在下轮修复）。
 *
 * @param opts.force 跳过节流窗口（手动 CLI / 同步兜底脚本用）
 * @param opts.prune 是否清理「主表已无」的 ghost 行，默认 true。手动兜底脚本 daily-sync.cjs
 *                   普通轮次传 false（「普通轮次绝不删服务表一行」的口径）；应用内调度器不传。
 */
export async function rebuildNoticePublicChanged(
  pool: Pool,
  opts: { force?: boolean; prune?: boolean } = {},
): Promise<RebuildResult> {
  if (_running) return { selected: 0, written: 0, pruned: 0, ids: [], skipped: "running" };
  if (!opts.force && Date.now() - _lastRunAt < MIN_INTERVAL_MS) {
    return { selected: 0, written: 0, pruned: 0, ids: [], skipped: "throttled" };
  }
  _running = true;
  const t0 = Date.now();
  try {
    const ctx = await loadPublicBuildContext(pool);
    const changedIds = await selectChangedPublicIds(pool);
    // 译文是独立输入：后台翻译器只写翻译表，不触发主表/商机/标题水位，必须单独拾取。
    // 水位在「写入成功之后」才前移——否则一次写失败会把这批译文永久跳过。
    const translation = await selectNewTranslationNoticeIds(pool).catch((err: unknown) => {
      console.warn("[notice-public] 译文增量拾取失败（下轮再试）:", (err as Error).message);
      return { ids: [] as number[], nextWatermark: null as number | null };
    });
    const ids = [...new Set([...changedIds, ...translation.ids])];
    const written = await writeRowsByIds(pool, ctx, ids);
    if (translation.nextWatermark != null) {
      await pool
        .execute("UPDATE sync_watermark SET id_wm = ? WHERE table_name = ?", [
          translation.nextWatermark,
          TRANSLATION_WATERMARK,
        ])
        .catch((err: unknown) => {
          console.warn("[notice-public] 译文水位前移失败（下轮会重复处理，幂等）:", (err as Error).message);
        });
    }
    const ghostIds = opts.prune === false ? [] : await selectPublicGhostIds(pool);
    const pruned = ghostIds.length > 0 ? await deletePublicRows(pool, ghostIds) : 0;
    if (ids.length > 0 || ghostIds.length > 0) {
      console.log(`[notice-public] 增量重建：选行 ${ids.length}（译文 ${translation.ids.length}） · 写入 ${written} · 清理 ${pruned}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
      await syncBuyerCandidates(pool).catch((err: unknown) => {
        console.warn("[notice-public] buyer_candidate 同步失败:", (err as Error).message);
      });
    }
    return { selected: ids.length, written, pruned, ids };
  } finally {
    // [2026-10-28 事故加固] 失败也走节流：此前 _lastRunAt 仅在成功路径更新，
    // 一旦某批数据持续写失败（如单行坏 contacts JSON 毒化整块），每个对账 tick 都会
    // 重跑昂贵的选行+取数（选行集 ~1.2 万行时分钟级），成为常态负载把 DB 拖死。
    _running = false;
    _lastRunAt = Date.now();
  }
}

/**
 * 按显式 notice_pk 列表重建服务表投影（唯一写入者链路不变）。
 *
 * 为什么需要：`--changed` 水位只看主表/商机/标题旁表——buyer / buyer_alias / buyer.name_zh
 * 变更不会让已有服务表行「看起来变旧」，于是改名/合并实体后投影会无限期停留在旧值。
 * 本函数由 `buyer/refresh` 在买家数据变更后调用，把受影响的公告行重新走一遍 buildPublicRow，
 * 产出新的 buyer_id / buyer_name / buyer_name_cn 快照。
 *
 * @param ids 需要重建的 notice_pk（调用方负责圈定：按 buyer_id 反查或按别名命中反查）
 * @returns 实际写入行数（不可准入/无编号行会被 buildPublicRow 丢弃，不补写）
 */
export async function rebuildPublicRowsByIds(pool: Pool, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const ctx = await loadPublicBuildContext(pool);
  const t0 = Date.now();
  const written = await writeRowsByIds(pool, ctx, ids);
  console.log(`[notice-public] 按 id 重建：选中 ${ids.length} · 写入 ${written}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  return written;
}

