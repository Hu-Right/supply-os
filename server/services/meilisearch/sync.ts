/**
 * Meilisearch 文档同步
 * Meilisearch document sync (full + incremental)
 *
 * @module server/services/meilisearch/sync
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { classifyAgencyType } from "../agency/index";
import { getClient, isHealthy, getIndexName } from "./client";
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

/**
 * notice_type 归一化：将混合存储的原始值映射为标准短代码
 * 全链路唯一服务端口径：宽表构建（wide-row-builder）、Meili 同步文档、
 * 推荐链路（recommend）与筛选构建（filter-builder）均调用本函数。
 */
export function normalizeNoticeType(raw: string | null | undefined): string {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase().trim();

  const SHORT_CODES: Record<string, string> = {
    ITB: "ITB", ITT: "ITB",
    RFQ: "RFQ", RFP: "RFP",
    EOI: "EOI", PQ: "PQ", PRE: "PQ",
    IC: "IC", RFI: "RFI", GPN: "GPN",
    // AWARD 必须在映射表内：保证函数对自身输出幂等
    //（buildSyncDocFromWideTable 二次归一化时 AWARD 不会漂移为 OTHER）
    AWARD: "AWARD",
    // 扩展类型短代码（与前端 noticeTypeKey CODE_MAP 对齐）；同样承担幂等职责
    PIN: "PIN", PMC: "PMC",
    // EU 三大合同分类（西语源数据 Suministros/Servicios/Obras 的归一化出口）
    SERVICES: "SERVICES", SUPPLIES: "SUPPLIES", WORKS: "WORKS",
  };
  if (SHORT_CODES[upper]) return SHORT_CODES[upper];

  // [口径一致性修复] 分隔符归一化：与前端 noticeTypeKey 完全同款字符集
  //（下划线/连字符/全角横线/括号/点/斜杠 → 空格），使 \b 单词边界对
  // snake_case 及 "consultation(PMC)" 等粘连形态生效
  const spaced = raw.replace(/[_\-–—()（）./\\]+/g, " ");

  if (/expression of interest|意向表达|意向征集|兴趣征询|\beoi\b/i.test(spaced)) return "EOI";
  if (/quotation|报价|询价/i.test(spaced)) return "RFQ";
  if (/\brfp\b|proposal|提案|建议书/i.test(spaced)) return "RFP";
  if (/pre[\s-]?qualif|资格预审/i.test(spaced)) return "PQ";
  if (/consultant|顾问/i.test(spaced)) return "IC";
  // sources sought（美国 SAM 市场调研公告）语义等同信息征询
  if (/request for information|sources sought|信息征询|\brfi\b/i.test(spaced)) return "RFI";
  if (/general procurement notice|\bgpn\b/i.test(spaced)) return "GPN";
  if (/contract award|award notice|授标|中标/i.test(spaced)) return "AWARD";

  // ── 扩展类型（与前端 PATTERN_RULES 对齐；具体规则先于通用规则）──
  // presolicitation（招标预告）语义属事前信息通知，须在 solicitation 规则前
  if (/prior information notice|presolicitation|\bpin\b|事前信息通知|预先信息通知/i.test(spaced)) return "PIN";
  if (/contract notice|合同通知|合同公告/i.test(spaced)) return "CONTRACT_NOTICE";
  if (/\bthreshold\b|门槛程序|阈值程序/i.test(spaced)) return "THRESHOLD";
  if (/preliminary market consultation|\bpmc\b|初步市场咨询|事前市场咨询/i.test(spaced)) return "PMC";
  if (/\bnegotiated\b|谈判程序|谈判采购/i.test(spaced)) return "NEGOTIATED";
  // 须在 ITB 前："Competitive – Open Bidding" 不得被通用招标规则截胡
  // "Non-Competitive"（非竞争性采购）不得被 \bcompetitive\b 误判
  if (/non[\s-]?competitive/i.test(spaced)) return "OTHER";
  if (/\bcompetitive\b|open bidding|竞争性|公开招标/i.test(spaced)) return "COMPETITIVE";
  // solicitation（美国 SAM 招标书，首页 OTHER 的最大来源）归入 ITB
  if (/solicitation/i.test(spaced)) return "ITB";
  // EU 三大合同分类：西语源数据的主分类（Servicios 先于 Suministros：
  // “Servicios de suministro de personal” 语义属服务而非物资）
  if (/servicio|\bservices?\b/i.test(spaced)) return "SERVICES";
  if (/suministro|\bsupplies\b/i.test(spaced)) return "SUPPLIES";
  if (/\bobras\b|construcci|\bworks\b/i.test(spaced)) return "WORKS";
  if (/\btenders?\b|\bbids?\b|\bitb\b|\bitt\b|招标|投标/i.test(spaced)) return "ITB";

  return "OTHER";
}

// ── 支持的语言列表 ──
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
 * 全量同步：先清空索引，再从宽表拉取全量数据写入。
 * 降级演练修复：多调用方（启动初始化/重建触发器/索引体检）可能并发调用，
 * 并发 deleteAllDocuments 会互相清空对方刚写入的批次，导致索引长期为空；
 * 加全局并发锁，重复调用直接跳过。
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
  const start = Date.now();

  try {
    await client.index(INDEX_NAME).deleteAllDocuments();
    console.log("[meilisearch] fullSync: 已清空旧索引，从宽表重建索引...");

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

      // addDocumentsInBatches 返回 Promise 数组，需 Promise.all 正确等待全部完成
      await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, MEILI_BATCH, { primaryKey: "id" }));
      totalSynced += docs.length;
      lastId = docs[docs.length - 1].id;

      if (docs.length < BATCH) break;
    }

    // 降级演练修复：addDocumentsInBatches 只保证任务入队，Meilisearch 内部索引
    // 仍在后台进行；若立即返回，查询会命中部分索引（回归实测 total 从 8.8 万
    // 降到 3.3 万）。等待索引文档数达到目标再返回，期间 _fullSyncRunning 保持
    // 置位，编排器自动路由 MySQL 降级。
    const indexStart = Date.now();
    while (true) {
      try {
        const stats = await client.index(INDEX_NAME).getStats();
        if (stats.numberOfDocuments >= totalSynced) break;
      } catch {
        // 统计失败（瞬时）忽略，继续等待
      }
      if (Date.now() - indexStart > 10 * 60 * 1000) {
        console.warn("[meilisearch] fullSync: 等待索引就绪超时（10 分钟），继续返回");
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    const elapsed = Date.now() - start;
    console.log(`[meilisearch] fullSync 完成: ${totalSynced} 条文档, ${elapsed}ms`);
    return { synced: totalSynced, elapsed, lastId };
  } catch (err) {
    console.error("[meilisearch] fullSync failed:", (err as Error).message);
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
