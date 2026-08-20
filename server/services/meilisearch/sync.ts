/**
 * Meilisearch 文档同步
 * Meilisearch document sync (full + incremental)
 *
 * @module server/services/meilisearch/sync
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { classifyAgencyType } from "../agency/index";
import { normalizeNoticeType } from "../../utils/notice-type";
import { getClient, isHealthy, getIndexName, buildNoticeIndexSettings } from "./client";
import { segmentZh } from "./segmentZh";

// NULL deadline 的哨兵值：0（纪元起点）
const NULL_DEADLINE_SENTINEL = 0;

// ── 机构别名映射缓存 ──
let _aliasMapCache: Map<string, string> | null = null;
let _aliasMapExpires = 0;

async function getAliasMap(pool: Pool): Promise<Map<string, string>> {
  if (_aliasMapCache && Date.now() < _aliasMapExpires) return _aliasMapCache;
  const aliasMap = new Map<string, string>();
  try {
    const [rows] = await pool.query("SELECT canonical, alias FROM crm_agency_aliases");
    for (const row of rows as RowDataPacket[]) {
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), String(row.canonical || "").trim());
    }
    _aliasMapCache = aliasMap;
    _aliasMapExpires = Date.now() + 10 * 60 * 1000; // 10 分钟缓存
  } catch {
    // 表不存在或查询失败：静默降级
  }
  return aliasMap;
}

// ── 支持的语言列表 ──
//（#8：normalizeNoticeType 已迁至 utils/notice-type.ts，本文件仅保留同步职责）
const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

/** 构建同步文档（从宽表行）：宽表已包含标准化字段和翻译，无需额外处理 */
function buildSyncDocFromWideTable(r: any) {
  // 构建多语言翻译字段
  // description 截断为 2000 字符以控制索引大小（关键词可能出现在较深位置）
  // 中文 zh 字段在写入前执行 jieba 分词，解决 Meilisearch 中文分词缺失问题
  const langFields: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGS) {
    langFields[`title_${lang}`] = String(r[`title_${lang}`] || "");
    const rawDesc = (String(r[`description_${lang}`] || "")).slice(0, 2000);
    // 仅中文字段需要 jieba 分词预处理
    langFields[`description_${lang}`] = lang === "zh" ? segmentZh(rawDesc) : rawDesc;
  }
  // 中文标题同样需要分词（标题中的关键词需被正确切分）
  langFields["title_zh"] = segmentZh(langFields["title_zh"]);

  // UNSPSC：宽表存储为逗号分隔字符串，转为数组
  const parseUnspsc = (val: any): string[] => val ? String(val).split(",").filter(Boolean) : [];

  return {
    id: Number(r.id),
    notice_id: String(r.notice_id || ""),
    reference: String(r.reference || ""),
    title: String(r.title || ""),
    description: (String(r.description || "")).slice(0, 2000),
    // 宽表已存储标准化后的值；此处再经 normalizeNoticeType 幂等归一（纵深防御，
    // 与推荐链路/宽表构建同一函数同一口径，防止历史存量 std 漂移入索引）
    country: String(r.country_std || ""),
    agency: String(r.agency_std || ""),
    agency_group: String(r.agency_group || ""),
    notice_type: normalizeNoticeType(r.notice_type_std),
    notice_type_normalized: normalizeNoticeType(r.notice_type_std),
    deadline_sec: r.deadline_sec ? Number(r.deadline_sec) : NULL_DEADLINE_SENTINEL,
    has_deadline: r.deadline_sec ? 1 : 0, // 排序辅助：NULL 截止日期排到最后（has_deadline:desc 优先）
    is_featured: r.is_featured ? 1 : 0,
    ...langFields,
    level1_id: parseUnspsc(r.unspsc_level1),
    level2_id: parseUnspsc(r.unspsc_level2),
    level3_id: parseUnspsc(r.unspsc_level3),
    level4_id: parseUnspsc(r.unspsc_level4),
    level5_id: parseUnspsc(r.unspsc_level5),
    // 精准分类字段（合并语义：精准码优先、原标签兜底，宽表已合并）
    precise_level1_id: parseUnspsc(r.precise_level1),
    precise_level2_id: parseUnspsc(r.precise_level2),
    precise_level3_id: parseUnspsc(r.precise_level3),
    precise_level4_id: parseUnspsc(r.precise_level4),
    precise_level5_id: parseUnspsc(r.precise_level5),
  };
}

/** 从宽表同步的 SQL（单表查询，零 JOIN） */
// 注意：不再查询 is_active，因为搜索过滤只用 deadline_sec 实时判断
const WIDE_TABLE_SYNC_SQL = `
  SELECT id, notice_id, reference, title, description,
         country_std, agency_std, agency_group, notice_type_std,
         deadline_sec, is_featured,
         unspsc_level1, unspsc_level2, unspsc_level3, unspsc_level4, unspsc_level5,
         precise_level1, precise_level2, precise_level3, precise_level4, precise_level5,
         title_zh, description_zh, title_en, description_en,
         title_fr, description_fr, title_ru, description_ru,
         title_es, description_es, title_ar, description_ar
  FROM crm_notice_search
`;

/**
 * 全量同步：构建临时索引 → swapIndexes 原子切换 → 清理旧索引。
 * P2-13 安全修复：旧实现先 deleteAllDocuments 再写入，重建期间搜索命中空索引；
 * 现改为在临时索引上全量构建完成后原子切换，切换前旧索引持续可查，零空白期。
 * 失败时仅清理临时索引，旧索引毫发无损。
 * 降级演练修复：多调用方并发调用时加全局并发锁，重复调用直接跳过。
 */
let _fullSyncRunning = false;

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
    // ── Step 1：创建临时索引并应用与主索引同源的设置 ──
    try {
      await client.createIndex(TMP_INDEX, { primaryKey: "id" });
    } catch {
      // 幂等：已存在或任务冲突忽略
    }
    await client.index(TMP_INDEX).updateSettings(buildNoticeIndexSettings() as any);
    console.log(`[meilisearch] fullSync: 构建临时索引 ${TMP_INDEX}（旧索引保持可查）...`);

    // ── Step 2：从宽表分批写入临时索引 ──
    const BATCH = 2000;
    const MEILI_BATCH = 200; // Meilisearch 分批写入大小，避免单次 HTTP 请求体过大
    let lastId = 0;
    let totalSynced = 0;

    while (true) {
      const [rows] = await pool.query(
        WIDE_TABLE_SYNC_SQL + " WHERE id > ? ORDER BY id ASC LIMIT ?",
        [lastId, BATCH]
      );

      const docs = (rows as any[]).map((r) => buildSyncDocFromWideTable(r));
      if (docs.length === 0) break;

      // addDocumentsInBatches 返回 Promise 数组，需 Promise.all 正确等待全部入队
      await Promise.all(client.index(TMP_INDEX).addDocumentsInBatches(docs, MEILI_BATCH, { primaryKey: "id" }));
      totalSynced += docs.length;
      lastId = docs[docs.length - 1].id;

      if (docs.length < BATCH) break;
    }

    // ── Step 3：等待临时索引文档处理就绪（addDocuments 仅保证入队）──
    const indexStart = Date.now();
    while (true) {
      try {
        const stats = await client.index(TMP_INDEX).getStats();
        if (stats.numberOfDocuments >= totalSynced) break;
      } catch {
        // 统计失败（瞬时）忽略，继续等待
      }
      if (Date.now() - indexStart > 10 * 60 * 1000) {
        console.warn("[meilisearch] fullSync: 等待临时索引就绪超时（10 分钟），放弃切换");
        throw new Error("TMP_INDEX_NOT_READY_TIMEOUT");
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    // ── Step 4：原子切换（切换前查询持续命中旧索引，零空白期）──
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
    // 失败路径：清理临时索引，旧索引保持原样（可用性零影响）
    try {
      await client.deleteIndex(TMP_INDEX);
    } catch {
      // 忽略清理失败
    }
    return { synced: 0, elapsed: Date.now() - start, lastId: 0 };
  } finally {
    _fullSyncRunning = false;
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
      WIDE_TABLE_SYNC_SQL + " WHERE id > ? ORDER BY id ASC LIMIT 5000",
      [watermark]
    );

    let updatedRaw: any[] = [];
    try {
      const [updatedRows] = await pool.query(
        WIDE_TABLE_SYNC_SQL +
        " WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY id ASC LIMIT 2000",
        []
      );
      updatedRaw = updatedRows as any[];
    } catch {
      // updated_at 列可能不存在
    }

    // 合并去重
    const rawMap = new Map<number, any>();
    for (const r of newRows as any[]) rawMap.set(r.id, r);
    for (const r of updatedRaw) rawMap.set(r.id, r);

    const allRaw = Array.from(rawMap.values()).sort((a, b) => a.id - b.id);
    if (allRaw.length === 0) return { synced: 0, newWatermark: watermark };

    // 权威值覆盖：is_featured/deadline_sec 从主表 crm_bid_notices 读取
    // 宽表 deadline_sec 是普通列（非生成列），可能因 deadline_ts 变更而陈旧，
    // 此处从主表读取权威值，确保 Meilisearch 索引状态一致
    const allIds = allRaw.map((r) => Number(r.id));
    try {
      const BATCH = 1000;
      const statusMap = new Map<number, { is_featured: number; deadline_sec: number }>();
      for (let i = 0; i < allIds.length; i += BATCH) {
        const batch = allIds.slice(i, i + BATCH);
        const ph = batch.map(() => "?").join(",");
        const [statusRows] = await pool.query(
          `SELECT id, is_featured, COALESCE(deadline_sec, 0) AS deadline_sec FROM crm_bid_notices WHERE id IN (${ph})`,
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

    const docs = allRaw.map((r) => buildSyncDocFromWideTable(r));
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
 * 修复：is_active/is_featured 从 crm_bid_notices 主表读取（权威数据源），
 *       不依赖宽表（宽表更新可能失败或被增量同步覆盖，导致 Meilisearch 状态不一致）
 *
 * 索引残留清理：宽表与主表均不存在的 ID（主表已删除、ghost 行已清理），
 *       从 Meilisearch 索引中删除对应文档，避免已删除公告仍可被搜到。
 *       安全边界：仅当 ID 同时缺席宽表与主表才删除——主表存在但宽表缺行
 *       属于同步不一致，交由对账修复，不误删索引文档。
 */
export async function syncNoticeIds(pool: Pool, ids: number[]): Promise<{ synced: number; deleted: number }> {
  const client = getClient();
  if (!client || !isHealthy() || ids.length === 0) return { synced: 0, deleted: 0 };
  const INDEX_NAME = getIndexName();

  try {
    const SQL_BATCH_SIZE = 1000; // MySQL IN(...) 查询分批，避免占位符过多
    let totalSynced = 0;
    let totalDeleted = 0;

    for (let i = 0; i < ids.length; i += SQL_BATCH_SIZE) {
      const batch = ids.slice(i, i + SQL_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(",");

      // 并行查询：宽表（主要字段）+ 主表（is_featured/deadline_sec 权威值）
      const [wideRows, statusRows] = await Promise.all([
        pool.query(WIDE_TABLE_SYNC_SQL + ` WHERE id IN (${placeholders}) ORDER BY id ASC`, batch),
        pool.query(`SELECT id, is_featured, COALESCE(deadline_sec, 0) AS deadline_sec FROM crm_bid_notices WHERE id IN (${placeholders})`, batch),
      ]);

      // 构建主表状态映射
      const statusMap = new Map<number, { is_featured: number; deadline_sec: number }>();
      for (const row of (statusRows[0] as any[])) {
        statusMap.set(Number(row.id), {
          is_featured: row.is_featured ? 1 : 0,
          deadline_sec: Number(row.deadline_sec) || 0,
        });
      }

      const docs = (wideRows[0] as any[]).map((r) => {
        const doc = buildSyncDocFromWideTable(r);
        // 用主表的权威值覆盖宽表值（修复宽表 deadline_sec 不一致问题）
        const status = statusMap.get(doc.id);
        if (status) {
          doc.is_featured = status.is_featured;
          doc.deadline_sec = status.deadline_sec;
          doc.has_deadline = status.deadline_sec > 0 ? 1 : 0;
        }
        return doc;
      });

      if (docs.length > 0) {
        await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, 500, { primaryKey: "id" }));
        totalSynced += docs.length;
      }

      // ── 索引残留清理：宽表与主表均不存在的 ID → 删除 Meilisearch 文档 ──
      const wideIdSet = new Set((wideRows[0] as any[]).map((r) => Number(r.id)));
      const ghostBatchIds = batch.filter((id) => !wideIdSet.has(id) && !statusMap.has(id));
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

/** 获取 MySQL 中公告总数 */
export async function getMysqlActiveCount(pool: Pool): Promise<number> {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM crm_bid_notices");
    return Number((rows as any[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

/** 获取宽表行数（索引同步的事实源） */
export async function getWideTableCount(pool: Pool): Promise<number> {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM crm_notice_search");
    return Number((rows as any[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}
