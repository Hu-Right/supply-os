/**
 * Meilisearch 文档同步
 * Meilisearch document sync (full + incremental)
 *
 * @module server/services/meilisearch/sync
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { TasksOrBatchesQuery } from "meilisearch";
import { normalizeNoticeType } from "../../utils/notice-type";
import { WIDE_LIMITS, truncate } from "../../utils/notice-field-limits";
import { isStablyExpired, STABLE_EXPIRED_WHERE_PUBLIC } from "../../utils/notice-expired";
import { fromBackbonePathColumn } from "../commodity/backbone-path";
import { getClient, isHealthy, getIndexName, buildNoticeIndexSettings } from "./client";


/**
 * 宽表读取准入片段（2026-11-13 构建时摘除闭环）：全量/增量同步不灌稳定过期行——
 * 过期行由 ghost 链清退、查询侧 MEILI_ACTIVE_FILTER 只管结果过滤，读取侧若不过滤
 * 就会「先灌 42 万死行再删」两段式空转。口径 = utils/notice-expired（30 天清退余量），
 * 与宽表 ghost 清退同一谓词，不在此重写第二份。
 */
export const WIDE_TABLE_SYNC_ADMISSION = "NOT " + STABLE_EXPIRED_WHERE_PUBLIC;

// ── 机构归一：Meili 从宽表读已归好的 buyer_name（buyer_group 维度 2026-10-31 退役）。
//（2026-10-31 机构口径收敛：买家实体匹配唯一入口见 buyer/entity-index；旧 agency_aliases 已退役）──

// ── 支持的语言列表：唯一来源 utils/languages ──
//（#8：normalizeNoticeType 已迁至 utils/notice-type.ts，本文件仅保留同步职责）

/**
 * 构建同步文档（从服务表行，零映射）
 *
 * 2026-11-28：宽表退役第一阶段——Meili 文档字段改服务表原生名：
 * `title_cn/description_cn`、`deadline_ts`、`notice_type_code`、`buyer_name`、
 * `country_code`、`has_attachments`、`estimated_value`，不再有 title_zh / deadline_sec /
 * notice_type_normalized / documents_count / is_featured 这些宽表别名。
 * 文档 `id` 仍是 Meili primaryKey 契约（= 服务表 notice_pk），由构建处显式赋予。
 */
export function buildSyncDocFromPublic(r: RowDataPacket) {
  // 内容语言只有原文 + 中/英（ADR-0024 单语言站 + 供给现实：只有 zh/en 有译文）
  const countryCodes = Array.isArray(r.country_codes)
    ? (r.country_codes as unknown[]).map((c) => String(c))
    : String(r.country_codes ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.replace(/["'\s]/g, "")).filter(Boolean);

  return {
    id: Number(r.notice_pk),
    notice_id: String(r.notice_id || ""),
    reference: String(r.reference || ""),
    title: String(r.title || ""),
    description: truncate(r.description, WIDE_LIMITS.description),
    title_cn: String(r.title_cn || ""),
    description_cn: truncate(r.description_cn ?? "", WIDE_LIMITS.description),
    title_en: String(r.title_en || ""),
    description_en: truncate(r.description_en ?? "", WIDE_LIMITS.description),
    // 国别：ISO2 主国家 + 多国 facet（展示国名由前端按码查表，不在索引里冗余原始写法）
    country_code: String(r.country_code || ""),
    country_codes: countryCodes,
    buyer_name: String(r.buyer_name || ""),
    notice_type_code: normalizeNoticeType(r.notice_type_code),
    // 截止：文档用 0 表示「无截止」的索引内部约定（服务表 DB 仍是 NULL）；
    // has_deadline 只服务排序（无截止排末尾），不是业务字段。
    deadline_ts: r.deadline_ts ? Number(r.deadline_ts) : 0,
    has_deadline: r.deadline_ts ? 1 : 0,
    is_opportunity: r.is_opportunity ? 1 : 0,
    estimated_value: Number(r.estimated_value) || 0,
    has_attachments: Number(r.has_attachments) || 0,
    backbone_node: fromBackbonePathColumn(r.backbone_path),
  };
}

/** 服务表同步 SQL（单表查询，零 JOIN、零别名映射） */
const PUBLIC_SYNC_SQL = `
  SELECT notice_pk, notice_id, reference, title, description,
         title_cn, description_cn, title_en, description_en,
         country_code, country_codes, buyer_name, notice_type_code,
         deadline_ts, is_opportunity, estimated_value, has_attachments, backbone_path
  FROM notice_public
`;

/**
 * 全量同步：构建临时索引 → swapIndexes 原子切换 → 清理旧索引。
 * P2-13 安全修复：旧实现先 deleteAllDocuments 再写入，重建期间搜索命中空索引；
 * 现改为在临时索引上全量构建完成后原子切换，切换前旧索引持续可查，零空白期。
 * 失败时仅清理临时索引，旧索引毫发无损。
 * 降级演练修复：多调用方并发调用时加全局并发锁，重复调用直接跳过。
 *
 * [2026-08-29 P1-A] swap 快照窗口防护：fullSync 进行期间，事件/对账级联
 * （syncNoticeIds）直写主索引的变更会被 swap 用 tmp 快照整体回滚。
 * 现改为暂存到 _pendingDuringFullSync，fullSync 结束（swap 后或失败后）统一补写。
 */
let _fullSyncRunning = false;

/** fullSync 期间暂存的级联变更 ID（swap 后统一补写，防止快照回滚丢失） */
const _pendingDuringFullSync = new Set<number>();

/** 是否有 fullSync 正在执行（编排器可据此路由降级） */
export function isFullSyncRunning(): boolean {
  return _fullSyncRunning;
}

export async function fullSync(pool: Pool): Promise<{ synced: number; elapsed: number; lastId: number }> {
  const client = getClient();
  if (!client || !isHealthy()) return { synced: 0, elapsed: 0, lastId: 0 };
  if (_fullSyncRunning) {
    console.warn("[meilisearch] fullSync 已在执行中，跳过重复调用");
    return { synced: 0, elapsed: 0, lastId: 0 };
  }
  _fullSyncRunning = true;
  const INDEX_NAME = getIndexName();
  // P2-13：临时索引名带时间戳，避免与上次残留同名冲突
  const TMP_INDEX = `${INDEX_NAME}_tmp_${Date.now()}`;
  const start = Date.now();

  try {
    // ── Step 0：清理陈旧的 tmp 残留索引（上次失败保留供诊断的 / 异常遗留的）──
    // [P2-C] 失败路径不再立即删除 tmp（保留诊断），靠此处下次启动时回收，防 400MB 级残留累积
    try {
      const stale = await client.getIndexes({ limit: 100 });
      for (const idx of stale.results as Array<{ uid: string }>) {
        if (idx.uid.startsWith(`${INDEX_NAME}_tmp_`) && idx.uid !== TMP_INDEX) {
          await client.deleteIndex(idx.uid).catch(() => {});
          console.log(`[meilisearch] fullSync: 清理陈旧临时索引 ${idx.uid}`);
        }
      }
    } catch {
      // 列举失败不阻断全量同步
    }

    // ── Step 1：创建临时索引并应用与主索引同源的设置 ──
    try {
      await client.createIndex(TMP_INDEX, { primaryKey: "id" });
    } catch {
      // 幂等：已存在或任务冲突忽略
    }
    await client.index(TMP_INDEX).updateSettings(buildNoticeIndexSettings());
    console.log(`[meilisearch] fullSync: 构建临时索引 ${TMP_INDEX}（旧索引保持可查）...`);

    // ── Step 2：从宽表分批写入临时索引 ──
    const BATCH = 5000;       // 单次从 MySQL 读取的行数
    const MEILI_BATCH = 500;  // Meilisearch 单次写入文档数（增大以减少 HTTP 轮次）
    let lastId = 0;
    let totalSynced = 0;

    while (true) {
      const [rows] = await pool.query(
        PUBLIC_SYNC_SQL + " WHERE notice_pk > ? AND " + WIDE_TABLE_SYNC_ADMISSION + " ORDER BY notice_pk ASC LIMIT ?",
        [lastId, BATCH]
      );

      const docs = (rows as RowDataPacket[]).map((r) => buildSyncDocFromPublic(r));
      if (docs.length === 0) break;

      // addDocumentsInBatches 返回 Promise 数组，需 Promise.all 正确等待全部入队
      await Promise.all(client.index(TMP_INDEX).addDocumentsInBatches(docs, MEILI_BATCH, { primaryKey: "id" }));
      totalSynced += docs.length;
      lastId = docs[docs.length - 1].id;

      if (docs.length < BATCH) break;
    }

    // ── Step 3：等待临时索引文档处理就绪（addDocuments 仅保证入队）──
    // [P2-C] 同时监测 Meili 端失败任务：addDocuments 入队成功 ≠ 消费成功，
    //        部分批次被拒时唯一旧结局是空转 30 分钟超时后全部丢弃重跑
    const indexStart = Date.now();
    while (true) {
      try {
        const stats = await client.index(TMP_INDEX).getStats();
        if (stats.numberOfDocuments >= totalSynced) break;
      } catch {
        // 统计失败（瞬时）忽略，继续等待
      }
      // 失败任务检查：全新 tmp 索引上出现任何 failed 任务均属异常（文档被拒/超限）
      try {
        const failed = await client.tasks.getTasks({ indexUids: [TMP_INDEX], statuses: ["failed"] } as TasksOrBatchesQuery);
        const failedResults = failed.results ?? [];
        const failedCount = failedResults.length;
        if (failedCount > 0) {
          const errMsg = failedResults[0]?.error?.message || "unknown";
          throw new Error(`TMP_INDEX_TASK_FAILURES(${failedCount}): ${String(errMsg)}`);
        }
      } catch (e) {
        if ((e as Error).message.startsWith("TMP_INDEX_TASK_FAILURES")) throw e;
        // getTasks 查询失败（瞬时）忽略
      }
      if (Date.now() - indexStart > 30 * 60 * 1000) {
        console.warn("[meilisearch] fullSync: 等待临时索引就绪超时（30 分钟），放弃切换");
        throw new Error("TMP_INDEX_NOT_READY_TIMEOUT");
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    // ── Step 4：原子切换（切换前查询持续命中旧索引，零空白期）──
    // rename: false 为 SDK IndexSwap 类型必填字段（Meili 端忽略其值）
    await client.swapIndexes([{ indexes: [INDEX_NAME, TMP_INDEX], rename: false }]);
    // 等待 swap 任务生效：主索引文档数达到目标值（最多 60s）
    const swapStart = Date.now();
    while (Date.now() - swapStart < 60_000) {
      try {
        const stats = await client.index(INDEX_NAME).getStats();
        if (stats.numberOfDocuments >= totalSynced) break;
      } catch {
        // 瞬时失败忽略
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // ── Step 5：清理旧索引（swap 后临时索引名持有旧数据）──
    try {
      await client.deleteIndex(TMP_INDEX);
    } catch {
      // 清理失败不影响可用性，仅残留一个旧索引
      console.warn(`[meilisearch] fullSync: 旧索引 ${TMP_INDEX} 清理失败，可手动删除`);
    }

    const elapsed = Date.now() - start;
    console.log(`[meilisearch] fullSync 完成: ${totalSynced} 条文档, ${elapsed}ms`);
    return { synced: totalSynced, elapsed, lastId };
  } catch (err) {
    console.error("[meilisearch] fullSync failed:", (err as Error).message);
    // [P2-C] 失败路径保留 tmp 索引供诊断（20 万级文档重跑代价高，先查因）；
    // 陈旧残留由下次 fullSync 的 Step 0 自动回收
    console.warn(`[meilisearch] fullSync: 临时索引 ${TMP_INDEX} 已保留供诊断，下次全量同步时自动清理`);
    return { synced: 0, elapsed: Date.now() - start, lastId: 0 };
  } finally {
    _fullSyncRunning = false;
    // [P1-A] swap 后（或失败后）统一补写 fullSync 期间暂存的级联变更：
    // 此时 _fullSyncRunning 已置 false，syncNoticeIds 守卫放行，写入的是
    // swap 后的主索引（新快照），变更不再被回滚
    if (_pendingDuringFullSync.size > 0) {
      const pending = Array.from(_pendingDuringFullSync);
      _pendingDuringFullSync.clear();
      console.log(`[meilisearch] fullSync 结束，补写期间暂存的 ${pending.length} 条级联变更`);
      void syncNoticeIds(pool, pending).catch((e) => {
        console.warn("[meilisearch] 暂存变更补写失败（交由定时对账兜底）:", (e as Error).message);
      });
    }
  }
}

/**
 * 增量同步：从宽表同步 id > watermark 的新增记录
 */
export async function incrementalSync(
  pool: Pool,
  watermark: number
): Promise<{ synced: number; newWatermark: number }> {
  const client = getClient();
  if (!client || !isHealthy()) return { synced: 0, newWatermark: watermark };
  const INDEX_NAME = getIndexName();

  try {
    const [newRows] = await pool.query(
      PUBLIC_SYNC_SQL + " WHERE notice_pk > ? AND " + WIDE_TABLE_SYNC_ADMISSION + " ORDER BY notice_pk ASC LIMIT 5000",
      [watermark]
    );

    let updatedRaw: RowDataPacket[] = [];
    try {
      const [updatedRows] = await pool.query(
        PUBLIC_SYNC_SQL +
        " WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY notice_pk ASC LIMIT 2000",
        []
      );
      updatedRaw = updatedRows as RowDataPacket[];
    } catch {
      // updated_at 列可能不存在
    }

    // 合并去重
    const rawMap = new Map<number, RowDataPacket>();
    for (const r of newRows as RowDataPacket[]) rawMap.set(r.id, r);
    for (const r of updatedRaw) rawMap.set(r.id, r);

    const allRaw = Array.from(rawMap.values()).sort((a, b) => a.id - b.id);
    if (allRaw.length === 0) return { synced: 0, newWatermark: watermark };

    // 权威值覆盖（仅对 updatedRaw 行）：
    // newRows 来自宽表增量同步（每 5s），其 is_featured/deadline_sec 由宽表构建器
    // 从主表直接读取，值已是最新；updatedRaw 是近 10 分钟内被更新的行，
    // 宽表可能尚未对账（deadline 对账 60s，featured 对账 5min），存在陈旧窗口。
    // 仅对 updatedRaw 查询主表权威值，减少不必要的 DB 往返。
    const updatedIdSet = new Set(updatedRaw.map((r) => Number(r.id)));
    if (updatedIdSet.size > 0) {
      const updatedIds = Array.from(updatedIdSet);
      try {
        const BATCH = 1000;
        const statusMap = new Map<number, { is_featured: number; deadline_sec: number }>();
        for (let i = 0; i < updatedIds.length; i += BATCH) {
          const batch = updatedIds.slice(i, i + BATCH);
          const ph = batch.map(() => "?").join(",");
          const [statusRows] = await pool.query(
            `SELECT id, is_featured, COALESCE(deadline_sec, 0) AS deadline_sec FROM bid_notices WHERE id IN (${ph})`,
            batch,
          );
          for (const row of statusRows as RowDataPacket[]) {
            statusMap.set(Number(row.id), {
              is_featured: row.is_featured ? 1 : 0,
              deadline_sec: Number(row.deadline_sec) || 0,
            });
          }
        }
        for (const r of allRaw) {
          const status = statusMap.get(Number(r.id));
          if (status) {
            r.is_featured = status.is_featured;
            r.deadline_sec = status.deadline_sec;
          }
        }
      } catch (e) {
        console.warn("[meilisearch] 权威值覆盖失败（静默降级）:", (e as Error).message);
      }
    }

    // [F17] fullSync 进行中：此刻直写主索引的变更会被 swap 快照整体回滚，
    // 且水位推进后这些行不再被增量选中——变更永久丢失。
    // 与 syncNoticeIds 的守卫一致：暂存到 _pendingDuringFullSync，由 fullSync
    // 结束（swap 后）的 finally 统一补写；水位照常推进，避免 fullSync 期间
    // 每 5 秒重复拉取同一批行。
    if (_fullSyncRunning) {
      for (const r of allRaw) {
        const id = Number(r.id);
        if (Number.isFinite(id) && id > 0) _pendingDuringFullSync.add(id);
      }
      const newWatermark = Math.max(watermark, allRaw[allRaw.length - 1].id);
      return { synced: 0, newWatermark };
    }

    const docs = allRaw.map((r) => buildSyncDocFromPublic(r));
    await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, 500, { primaryKey: "id" }));
    // P1-24 安全修复：水位不可回退，取 Math.max 防止低 ID 更新导致周期性全量重灌
    const newWatermark = Math.max(watermark, allRaw[allRaw.length - 1].id);
    return { synced: docs.length, newWatermark };
  } catch (err) {
    console.error("[meilisearch] incrementalSync failed:", (err as Error).message);
    return { synced: 0, newWatermark: watermark };
  }
}

/**
 * 按 ID 重新同步指定公告到 Meilisearch（从宽表）
 * 内部分批处理，支持大批量 ID（如 is_active 刷新产生的数万条变更）
 *
 * 修复：is_active/is_featured 从 bid_notices 主表读取（权威数据源），
 *       不依赖宽表（宽表更新可能失败或被增量同步覆盖，导致 Meilisearch 状态不一致）
 *
 * 索引残留清理：宽表缺行的公告，按四档口径决定是否删除索引文档：
 *       主表也不存在 → 删（公告已真删除）；
 *       主表存在但不满足平台公告公开可见口径（entry_source='platform' 且非 published）→ 删；
 *       主表存在且已稳定过期（截止已过且超清退余量 30 天，isStablyExpired）→ 删
 *         （2026-11-13 构建时摘除：宽表 ghost 清退后，过期文档若不在此删除会永久残留
 *          索引占体量——查询侧 MEILI_ACTIVE_FILTER 只在查询时过滤，不回收索引空间）；
 *       主表存在且可见未过期 → 不删，属宽表同步不一致，交由对账修复，不误删索引文档。
 *       （D1 修复：旧实现要求「同时缺席宽表与主表」才删，导致已撤回/待审核的平台公告
 *        在 ghost 对账删除宽表行后，索引文档永久残留可搜。）
 */
export async function syncNoticeIds(pool: Pool, ids: number[]): Promise<{ synced: number; deleted: number }> {
  const client = getClient();
  if (!client || !isHealthy() || ids.length === 0) return { synced: 0, deleted: 0 };

  // [P1-A] fullSync 进行中：此刻直写主索引的变更会被 swap 快照整体回滚，
  // 改为暂存到 _pendingDuringFullSync，fullSync 结束后由其 finally 统一补写。
  // 返回 synced=ids.length 计入已处理，避免上层级联判定失败并入重试队列造成重复补写。
  if (_fullSyncRunning) {
    for (const id of ids) {
      if (Number.isFinite(id) && id > 0) _pendingDuringFullSync.add(id);
    }
    return { synced: ids.length, deleted: 0 };
  }

  const INDEX_NAME = getIndexName();

  try {
    const SQL_BATCH_SIZE = 1000; // MySQL IN(...) 查询分批，避免占位符过多
    let totalSynced = 0;
    let totalDeleted = 0;

    for (let i = 0; i < ids.length; i += SQL_BATCH_SIZE) {
      const batch = ids.slice(i, i + SQL_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(",");

      // 并行查询：宽表（主要字段）+ 主表（is_featured/deadline_sec 权威值 + 可见性判定列）
      const [wideRows, statusRows] = await Promise.all([
        pool.query(PUBLIC_SYNC_SQL + ` WHERE notice_pk IN (${placeholders}) ORDER BY notice_pk ASC`, batch),
        pool.query(
          `SELECT id, is_featured, COALESCE(deadline_sec, 0) AS deadline_sec,
                  entry_source, IFNULL(rfq_status, '') AS rfq_status
           FROM bid_notices WHERE id IN (${placeholders})`,
          batch,
        ),
      ]);

      // 构建主表状态映射；visible 与 lib/utils/notice-expired 的 PLATFORM_PUBLISHED_ONLY
      // + 稳定过期清退（isStablyExpired）同口径（2026-11-13 构建时摘除第四档）
      const statusMap = new Map<number, { is_featured: number; deadline_sec: number; visible: boolean }>();
      for (const row of (statusRows[0] as RowDataPacket[])) {
        const entrySource = String(row.entry_source ?? "crawl");
        statusMap.set(Number(row.id), {
          is_featured: row.is_featured ? 1 : 0,
          deadline_sec: Number(row.deadline_sec) || 0,
          visible: (entrySource !== "platform" || row.rfq_status === "published")
            && !isStablyExpired(row.deadline_sec),
        });
      }

      const docs = (wideRows[0] as RowDataPacket[]).map((r) => {
        const doc = buildSyncDocFromPublic(r);
        // 用主表权威值覆盖（截止时间可能与服务表快照不一致；精选已由 is_opportunity 表达）
        const status = statusMap.get(doc.id);
        if (status) {
          doc.deadline_ts = status.deadline_sec;
          doc.has_deadline = status.deadline_sec > 0 ? 1 : 0;
        }
        return doc;
      });

      if (docs.length > 0) {
        await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, 500, { primaryKey: "id" }));
        totalSynced += docs.length;
      }

      // ── 索引残留清理（D1）：宽表缺行时，按主表存在性与公开可见口径决定是否删文档 ──
      const wideIdSet = new Set((wideRows[0] as RowDataPacket[]).map((r) => Number(r.id)));
      const ghostBatchIds = batch.filter((id) => {
        if (wideIdSet.has(id)) return false;
        const st = statusMap.get(id);
        return !st || !st.visible;
      });
      if (ghostBatchIds.length > 0) {
        await client.index(INDEX_NAME).deleteDocuments(ghostBatchIds);
        totalDeleted += ghostBatchIds.length;
        console.log(`[meilisearch] 索引残留清理: 删除 ${ghostBatchIds.length} 条已删除公告的索引文档`);
      }
    }

    return { synced: totalSynced, deleted: totalDeleted };
  } catch (err) {
    console.warn("[meilisearch] syncNoticeIds failed:", (err as Error).message);
    return { synced: 0, deleted: 0 };
  }
}

/**
 * 索引孤儿清理：删掉「宽表已不存在、索引仍留着」的文档。
 *
 * 为什么必须有：删除类变更（ghost 清退、平台撤下）靠 syncNoticeIds 级联删索引，
 * 而级联的重试队列是进程内 Map（重启即丢），Meili 不健康时也会整批跳过、
 * 只留一个 requestIndexRebuild 标记。于是「宽表删了、索引还能搜到」会缓慢累积——
 * 2026-11 实测索引 560,972 条 vs 宽表 550,733 条，多出 10,239 条。
 *
 * 成本：N/1000 次索引分页 + N 个 id 的宽表点查，55 万条约 1 分钟，
 * 故只在「索引条数明显多于宽表」时由全量对账触发（见 sync-scheduler），不做常驻。
 */
export async function pruneOrphanIndexDocs(
  pool: Pool,
  opts: { batchSize?: number; maxDeletes?: number } = {},
): Promise<{ scanned: number; deleted: number; orphans: number }> {
  const client = getClient();
  if (!client || !isHealthy()) return { scanned: 0, deleted: 0, orphans: 0 };

  const batchSize = opts.batchSize ?? 1000;
  const maxDeletes = opts.maxDeletes ?? 200_000;
  const index = client.index(getIndexName());

  const orphans: number[] = [];
  let scanned = 0;

  // 先全量枚举再统一删：边翻页边删会让 offset 前移，后半段被整段跳过。
  while (true) {
    const page = await index.getDocuments<{ id: number }>({
      limit: batchSize,
      offset: scanned,
      fields: ["id"],
    });
    const rows = (page.results ?? []) as Array<{ id: number }>;
    if (rows.length === 0) break;
    scanned += rows.length;

    const ids = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      const [existing] = await pool.query(`SELECT notice_pk FROM notice_public WHERE notice_pk IN (${ph})`, ids);
      const live = new Set((existing as RowDataPacket[]).map((r) => Number(r.notice_pk)));
      for (const id of ids) if (!live.has(id)) orphans.push(id);
    }

    if (rows.length < batchSize) break;
  }

  let deleted = 0;
  for (let i = 0; i < orphans.length && deleted < maxDeletes; i += batchSize) {
    const batch = orphans.slice(i, i + batchSize);
    await index.deleteDocuments(batch);
    deleted += batch.length;
  }

  return { scanned, deleted, orphans: orphans.length };
}

/** 获取 MySQL 中公告总数 */
export async function getMysqlActiveCount(pool: Pool): Promise<number> {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM bid_notices");
    return Number((rows as RowDataPacket[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

/** 获取宽表行数（索引同步的事实源） */
export async function getWideTableCount(pool: Pool): Promise<number> {
  try {
    const [rows] = await pool.query(`SELECT COUNT(*) AS cnt FROM notice_public`);
    return Number((rows as RowDataPacket[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}


