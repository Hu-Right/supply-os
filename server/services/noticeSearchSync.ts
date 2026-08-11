/**
 * 搜索宽表同步服务
 * Notice search wide table sync service
 *
 * @module server/services/noticeSearchSync
 * @description 负责 crm_notice_search 宽表的数据同步：
 *              - 启动时全量回填（宽表为空时自动触发）
 *              - 定时增量同步（新增 + 近期更新的记录）
 *              - 按 ID 精确同步（状态变更时调用）
 *              所有标准化逻辑（国家/机构/采购类型）在写入时完成，
 *              搜索时零计算。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../utils/normalize";
import { normalizeNoticeType } from "./meilisearch/sync";
import { classifyAgencyType } from "./agencyI18n";
import { COUNTRY_NAME_ZH } from "../../src/shared/data/countryNames";

// ── 国家标准化映射（复用 countries.ts 的逻辑）──
const UPPER_TO_CANONICAL = new Map<string, string>();
{
  const zhGroups = new Map<string, string[]>();
  for (const [en, zh] of Object.entries(COUNTRY_NAME_ZH)) {
    if (!zhGroups.has(zh)) zhGroups.set(zh, []);
    zhGroups.get(zh)!.push(en);
  }
  for (const [, forms] of Array.from(zhGroups.entries())) {
    if (["东部和南部非洲", "西部和中部非洲", "西南印度洋", "多国", "区域"].includes(forms[0])) continue;
    const canonical = forms.find((f) => /[a-z]/.test(f)) || forms[0];
    for (const form of forms) {
      UPPER_TO_CANONICAL.set(form.toUpperCase(), canonical);
    }
    UPPER_TO_CANONICAL.set(canonical.toUpperCase(), canonical);
  }
}

function normalizeCountry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (COUNTRY_NAME_ZH[trimmed]) return UPPER_TO_CANONICAL.get(trimmed.toUpperCase()) || trimmed;
  const canonical = UPPER_TO_CANONICAL.get(trimmed.toUpperCase());
  if (canonical) return canonical;
  return trimmed;
}

// ── 支持的语言列表 ──
const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

// ── 同步 SQL（含所有语言翻译，不含 UNSPSC）──
const WIDE_SYNC_SELECT = `
  SELECT n.id, n.notice_id, n.reference, n.title,
         n.description,
         n.country, n.agency, n.notice_type, n.deadline_sec,
         n.is_active, n.is_featured,
         n.estimated_value, n.documents, n.procurement_files,
         opp.description_cn, LEFT(opp.bid_overview, 200) AS bid_overview,
         opp.beneficiary_countries
`;
const WIDE_SYNC_JOIN = `
  FROM crm_bid_notices n
  LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id
    AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)
`;

// ── 批量查询翻译（按 notice_id 列表查询所有语言）──
async function loadTranslationsByNoticeIds(pool: Pool, noticeIds: number[]): Promise<Map<number, Record<string, { title: string; description: string }>>> {
  if (noticeIds.length === 0) return new Map();
  const result = new Map<number, Record<string, { title: string; description: string }>>();
  
  const placeholders = noticeIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT notice_id, lang, title_tr, description_tr
     FROM crm_notice_translations
     WHERE notice_id IN (${placeholders})`,
    noticeIds,
  );
  
  for (const row of rows as RowDataPacket[]) {
    const nid = Number(row.notice_id);
    if (!result.has(nid)) result.set(nid, {});
    const entry = result.get(nid)!;
    entry[String(row.lang)] = {
      title: String(row.title_tr || ""),
      description: String(row.description_tr || ""),
    };
  }
  return result;
}

// ── 金额字段解析：提取数值部分（处理 "USD 14,000" 等格式）──
function parseDecimalValue(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return raw;
  const str = String(raw).trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── UNSPSC 批量查询（按 notice_id 列表查询，避免 GROUP_CONCAT）──
async function loadUnspscByNoticeIds(pool: Pool, noticeIds: string[]): Promise<Map<string, Record<string, string>>> {
  if (noticeIds.length === 0) return new Map();
  const result = new Map<string, Record<string, Set<string>>>();
  
  const placeholders = noticeIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT notice_id, level1_id, level2_id, level3_id, level4_id, level5_id
     FROM crm_bid_notice_unspsc_codes
     WHERE notice_id IN (${placeholders})`,
    noticeIds,
  );
  
  for (const row of rows as RowDataPacket[]) {
    const nid = String(row.notice_id);
    if (!result.has(nid)) {
      result.set(nid, {
        level1: new Set(), level2: new Set(), level3: new Set(),
        level4: new Set(), level5: new Set(),
      });
    }
    const entry = result.get(nid)!;
    if (row.level1_id) entry.level1.add(String(row.level1_id));
    if (row.level2_id) entry.level2.add(String(row.level2_id));
    if (row.level3_id) entry.level3.add(String(row.level3_id));
    if (row.level4_id) entry.level4.add(String(row.level4_id));
    if (row.level5_id) entry.level5.add(String(row.level5_id));
  }
  
  // 转换为 Map<string, Record<string, string>>
  const final = new Map<string, Record<string, string>>();
  for (const [nid, entry] of result) {
    final.set(nid, {
      level1: Array.from(entry.level1).join(","),
      level2: Array.from(entry.level2).join(","),
      level3: Array.from(entry.level3).join(","),
      level4: Array.from(entry.level4).join(","),
      level5: Array.from(entry.level5).join(","),
    });
  }
  return final;
}

// ── 宽表行构建 ──
function buildWideRow(
  r: any,
  aliasMap: Map<string, string>,
  unspsc?: Record<string, string>,
  translations?: Record<string, { title: string; description: string }>,
): Record<string, any> {
  const country = String(r.country || "").trim();
  const agency = String(r.agency || "").trim();
  const countryStd = normalizeCountry(country).slice(0, 100);

  const agencyStd = (agency ? (aliasMap.get(agency.toUpperCase()) || agency) : "").slice(0, 200);
  const typeInfo = agencyStd && countryStd ? classifyAgencyType(agencyStd, countryStd) : null;
  const agencyGroup = (typeInfo?.typeKey || "").slice(0, 100);
  const noticeTypeStd = normalizeNoticeType(r.notice_type).slice(0, 20);
  const docs = normalizeDocumentRows(r.documents, r.procurement_files);
  const deadlineSec = r.deadline_sec ? Number(r.deadline_sec) : 0;

  // 构建多语言翻译字段
  // PERF: 所有 description_* 截断到 2000 字符，与 VARCHAR(2000) 列类型对齐
  // 避免 InnoDB 溢出页存储，确保数据全部存储在行内
  const langFields: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGS) {
    const tr = translations?.[lang];
    // 精选公告的中文使用人工拆解的 description_cn
    if (lang === "zh" && r.is_featured && r.description_cn) {
      langFields[`title_${lang}`] = String(tr?.title || "").slice(0, 1000);
      langFields[`description_${lang}`] = String(r.description_cn || "").slice(0, 2000);
    } else {
      langFields[`title_${lang}`] = String(tr?.title || "").slice(0, 1000);
      langFields[`description_${lang}`] = String(tr?.description || "").slice(0, 2000);
    }
  }

  return {
    id: Number(r.id),
    notice_id: String(r.notice_id || "").slice(0, 100),
    title: String(r.title || "").slice(0, 1000),
    reference: String(r.reference || "").slice(0, 200),
    description: String(r.description || "").slice(0, 2000),
    ...langFields,
    country_std: countryStd,
    agency_std: agencyStd,
    agency_group: agencyGroup,
    notice_type_std: noticeTypeStd,
    deadline_sec: isNaN(deadlineSec) ? 0 : deadlineSec,
    estimated_value: parseDecimalValue(r.estimated_value),
    is_active: r.is_active ? 1 : 0,
    is_featured: r.is_featured ? 1 : 0,
    unspsc_level1: (unspsc?.level1 || "").slice(0, 2000),
    unspsc_level2: (unspsc?.level2 || "").slice(0, 2000),
    unspsc_level3: (unspsc?.level3 || "").slice(0, 2000),
    unspsc_level4: (unspsc?.level4 || "").slice(0, 2000),
    unspsc_level5: (unspsc?.level5 || "").slice(0, 2000),
    description_cn: String(r.description_cn || "").slice(0, 500),
    bid_overview: String(r.bid_overview || "").slice(0, 200),
    beneficiary_countries: String(r.beneficiary_countries || "").slice(0, 300),
    documents_count: docs.length,
  };
}

// ── 机构别名映射加载 ──
async function loadAliasMap(pool: Pool): Promise<Map<string, string>> {
  const aliasMap = new Map<string, string>();
  try {
    const [rows] = await pool.query("SELECT canonical, alias FROM crm_agency_aliases");
    for (const row of rows as RowDataPacket[]) {
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), String(row.canonical || "").trim());
    }
  } catch {
    // 表不存在或查询失败：静默降级
  }
  return aliasMap;
}

// ── 确保 UNSPSC 列宽足够 ──
async function ensureUnspscColumns(pool: Pool): Promise<void> {
  try {
    for (let level = 1; level <= 5; level++) {
      await pool.query(
        `ALTER TABLE crm_notice_search MODIFY COLUMN unspsc_level${level} TEXT NOT NULL`
      );
    }
  } catch {
    // 列不存在或已是目标类型，静默跳过
  }
}

// ── 批量写入宽表 ──
async function upsertWideRows(pool: Pool, rows: Record<string, any>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let totalSynced = 0;

  // 构建语言字段列表
  const langColumns = SUPPORTED_LANGS.flatMap(lang => [`title_${lang}`, `description_${lang}`]);
  const allColumns = [
    "id", "notice_id", "title", "reference", "description",
    ...langColumns,
    "country_std", "agency_std", "agency_group", "notice_type_std",
    "deadline_sec", "estimated_value", "is_active", "is_featured",
    "unspsc_level1", "unspsc_level2", "unspsc_level3", "unspsc_level4", "unspsc_level5",
    "description_cn", "bid_overview", "beneficiary_countries", "documents_count",
  ];
  
  const placeholders = allColumns.map(() => "?").join(", ");
  const updateColumns = allColumns.filter(c => c !== "id").map(c => `${c}=VALUES(${c})`).join(", ");

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchPlaceholders = batch.map(() => `(${placeholders})`).join(",");
    const params: any[] = [];
    for (const row of batch) {
      params.push(
        row.id, row.notice_id, row.title, row.reference, row.description,
        ...SUPPORTED_LANGS.flatMap(lang => [row[`title_${lang}`], row[`description_${lang}`]]),
        row.country_std, row.agency_std, row.agency_group, row.notice_type_std,
        row.deadline_sec, row.estimated_value, row.is_active, row.is_featured,
        row.unspsc_level1, row.unspsc_level2, row.unspsc_level3, row.unspsc_level4, row.unspsc_level5,
        row.description_cn, row.bid_overview, row.beneficiary_countries, row.documents_count,
      );
    }
    await pool.query(
      `INSERT INTO crm_notice_search (${allColumns.join(", ")}) VALUES ${batchPlaceholders}
      ON DUPLICATE KEY UPDATE ${updateColumns}`,
      params,
    );
    totalSynced += batch.length;
  }
  return totalSynced;
}

// ══════════════════════════════════════════════════════════════════
// 公开 API
// ══════════════════════════════════════════════════════════════════

/**
 * 全量回填宽表
 */
export async function fullBackfill(pool: Pool): Promise<{ synced: number; elapsed: number }> {
  const start = Date.now();
  const aliasMap = await loadAliasMap(pool);
  
  // 确保列宽足够
  await ensureUnspscColumns(pool);

  let lastId = 0;
  let totalSynced = 0;
  const BATCH = 500;

  try {
    while (true) {
      // 查询主表数据
      const [rows] = await pool.query(
        WIDE_SYNC_SELECT + WIDE_SYNC_JOIN + " WHERE n.id > ? ORDER BY n.id ASC LIMIT ?",
        [lastId, BATCH],
      );
      const rawRows = rows as any[];
      if (rawRows.length === 0) break;

      // 批量查询 UNSPSC 和翻译
      const noticeIds = rawRows.map((r) => String(r.notice_id));
      const ids = rawRows.map((r) => Number(r.id));
      const [unspscMap, translationsMap] = await Promise.all([
        loadUnspscByNoticeIds(pool, noticeIds),
        loadTranslationsByNoticeIds(pool, ids),
      ]);

      // 构建宽表行
      const wideRows = rawRows.map((r) => buildWideRow(
        r,
        aliasMap,
        unspscMap.get(String(r.notice_id)),
        translationsMap.get(Number(r.id)),
      ));
      const synced = await upsertWideRows(pool, wideRows);
      totalSynced += synced;
      lastId = rawRows[rawRows.length - 1].id;

      if (rawRows.length < BATCH) break;
    }

    const elapsed = Date.now() - start;
    console.log(`[wide-table] 全量回填完成: ${totalSynced} 条, ${elapsed}ms`);
    return { synced: totalSynced, elapsed };
  } catch (err) {
    console.error("[wide-table] 全量回填失败:", (err as Error).message);
    return { synced: 0, elapsed: Date.now() - start };
  }
}

/**
 * 增量同步
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

    let updatedRaw: any[] = [];
    try {
      const [updatedRows] = await pool.query(
        WIDE_SYNC_SELECT + WIDE_SYNC_JOIN +
        " WHERE n.updated_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY n.id ASC LIMIT 2000",
        [],
      );
      updatedRaw = updatedRows as any[];
    } catch { /* updated_at 列可能不存在 */ }

    const docMap = new Map<number, any>();
    for (const r of newRows as any[]) docMap.set(r.id, r);
    for (const r of updatedRaw) docMap.set(r.id, r);

    const allRaw = Array.from(docMap.values()).sort((a, b) => a.id - b.id);
    if (allRaw.length === 0) return { synced: 0, newWatermark: watermark };

    // 批量查询 UNSPSC 和翻译
    const noticeIds = allRaw.map((r) => String(r.notice_id));
    const ids = allRaw.map((r) => Number(r.id));
    const [unspscMap, translationsMap] = await Promise.all([
      loadUnspscByNoticeIds(pool, noticeIds),
      loadTranslationsByNoticeIds(pool, ids),
    ]);

    const wideRows = allRaw.map((r) => buildWideRow(
      r,
      aliasMap,
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
      r,
      aliasMap,
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
// 缓存宽表就绪状态，避免每次搜索都查询
let _wideTableReadyCache: { ready: boolean; expires: number } | null = null;
const WIDE_TABLE_READY_CACHE_TTL = 60 * 1000; // 1 分钟

export async function isWideTableReady(pool: Pool): Promise<boolean> {
  // 检查缓存
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
 */
export function startWideTableSync(pool: Pool, options: { intervalMs?: number } = {}): () => void {
  const intervalMs = options.intervalMs ?? 30 * 1000;
  let stopped = false;
  let watermark = 0;
  const stopFns: Array<() => void> = [];

  void (async () => {
    try {
      const ready = await isWideTableReady(pool);
      if (!ready) {
        console.log("[wide-table] 宽表为空，启动全量回填…");
        const result = await fullBackfill(pool);
        if (result.synced > 0) {
          const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
          watermark = Number((maxRows as any[])[0]?.max_id || 0);
          console.log(`[wide-table] 全量回填完成: ${result.synced} 条, watermark=${watermark}`);
        }
      } else {
        const [maxRows] = await pool.query("SELECT MAX(id) AS max_id FROM crm_notice_search");
        watermark = Number((maxRows as any[])[0]?.max_id || 0);
        console.log(`[wide-table] 宽表已就绪: watermark=${watermark}, 增量同步已启动 (间隔 ${intervalMs / 1000}s)`);
      }

      const timer = setInterval(async () => {
        if (stopped) return;
        try {
          const { synced, newWatermark } = await incrementalWideSync(pool, watermark);
          if (synced > 0) {
            console.log(`[wide-table] 增量同步: ${synced} 条 (watermark ${watermark} → ${newWatermark})`);
          }
          watermark = newWatermark;
        } catch (err) {
          console.warn("[wide-table] 增量同步异常:", (err as Error).message);
        }
      }, intervalMs);
      stopFns.push(() => clearInterval(timer));
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
