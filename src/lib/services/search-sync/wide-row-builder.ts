/**
 * 宽表行构建器 + 数据加载
 * Wide Row Builder & Data Loading
 *
 * @module server/services/search-sync/wide-row-builder
 * @description 负责 crm_notice_search 宽表的数据加载、行构建、deadline 对账和批量写入。
 *              与 sync-scheduler.ts（调度层）分离，实现数据构建与同步时机的解耦。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { normalizeNoticeType } from "../../utils/notice-type";
import { classifyAgencyType } from "../agency/index";
import { COUNTRY_NAME_ZH } from "../../data/countryNames";
import { normalizeCountry } from "../../utils/countryNormalize";
import { backbonePathOfCodes } from "../commodity/backbone-cache";
import { DESC_SOURCE_EXPR, WIDE_LIMITS, TRANSLATION_MODEL, truncate } from "../../utils/notice-field-limits";
import { WIDE_FP_EXPR, WIDE_FP_COLUMN } from "./wide-fingerprint";
// JOIN 片段来自叶子模块 wide-sync-sql：不得在本文件定义后再被 fingerprint 反向导入（会成环）
import { WIDE_OPP_JOIN, WIDE_SYNC_JOIN } from "./wide-sync-sql";
import { upsertNoticeNodes } from "./notice-nodes";

export { WIDE_OPP_JOIN, WIDE_SYNC_JOIN };

// ── 支持的语言列表 ──
export const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

// ── 对账逻辑已拆至 wide-row-reconcile.ts ──

// ── 批量写入宽表 ──

// ── 同步 SQL（含所有语言翻译，不含 UNSPSC）──
// 注意：不再查询 is_active，因为搜索过滤只用 deadline_sec 实时判断
/**
 * 宽表主查询 SELECT（字段顺序与 buildWideRow 读取的 key 一致）。
 *
 * @param withFp 是否包指纹列。必须跟随 `isFingerprintColumn()` 结果：
 *   迁移 087 需在生产维护窗口才能执行，列不存在时多带这一列会让整批 SELECT 报错，
 *   并被外层 try/catch 吞成 warning（同步静默停摆）。
 */
export function wideSyncSelect(withFp: boolean): string {
  return `
  SELECT n.id, n.notice_id, n.reference, n.title,
         ${withFp ? `${WIDE_FP_EXPR} AS ${WIDE_FP_COLUMN},` : ""}
         ${DESC_SOURCE_EXPR} AS description,
         n.country, n.agency, n.notice_type, n.deadline_sec,
         n.is_featured,
         n.estimated_value, n.documents, n.procurement_files,
         n.published_date, n.entry_source, n.category_l1_id, n.category_l2_id,
         opp.description_cn, LEFT(opp.bid_overview, ${WIDE_LIMITS.bidOverview}) AS bid_overview,
         opp.beneficiary_countries
`;
}
/** 机会表合格行 JOIN 片段与主查询 JOIN 均定义于 wide-sync-sql（叶子模块），
 *  此处重导出仅为保持既有导入路径兼容（避免 builder ↔ fingerprint 循环依赖） */

// ── 批量查询翻译（按 notice_id 列表查询所有语言）──
/** 单条语言的译文携带 model，供 buildWideRow 判定是否同语言直通 */
export interface WideTranslation {
  title: string;
  description: string;
  model: string;
}

/**
 * 取各语言译文原始列（不做任何语义加工）。
 * 同语言直通的原文回填规则只存在于 buildWideRow 一处（I2），
 * 因此本函数不再 JOIN 主表/机会表，也不在此处拿原文替位。
 */
export async function loadTranslationsByNoticeIds(pool: Pool, noticeIds: number[]): Promise<Map<number, Record<string, WideTranslation>>> {
  if (noticeIds.length === 0) return new Map();
  const result = new Map<number, Record<string, WideTranslation>>();

  const placeholders = noticeIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT notice_id, lang, title_tr, description_tr, model
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
      model: String(row.model || ""),
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
  const cleaned = str.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── 品目挂靠装载（按公告取码，避免 GROUP_CONCAT）──
/** 一行的挂靠输入：桥表码为权威源，主表自填分类（旧字典行 id）是平台公告的唯一兜底 */
export interface UnspscSourceRow {
  /** 桥表外部编号（= crm_bid_notices.notice_id） */
  noticeId: string;
  /** 主表 `category_l1_id` / `category_l2_id`（旧字典行 id）；无则传空 */
  categoryIds?: Array<number | null | undefined>;
}

/**
 * 同时产出 backbone_path：公告的 8 位码 → 品目骨架节点码（含全部祖先）。
 * 为什么在这里算而不是在 buildWideRow 里算：桥表行已在本函数一次取回，
 * 而 buildWideRow 是同步纯函数（ADR-0002：宽表业务内容只由 buildWideRow → upsertWideRows 写）；
 * 换算口径依旧只在 commodity/backbone-cache 与 commodity/backbone-path 两处（缓存 + 口径），本处不重写规则。
 *
 * 平台公告（entry_source='platform'）在桥表里没有行 ⇒ 用主表自填分类翻成 8 位码后走**同一份**挂靠
 * 规则（D8 回归：这类公告此前在全局搜索 / 热榜 / 推荐的分类维度上永久缺席）。旧字典 level=1 是
 * A..J 字母容器（`code` 是单字母，压根没有 8 位码）⇒ 换不出码就如实留空，不做臆测映射
 * （与 commodity/tree.ts 的 resolveUnspscIdsToCommodityPath 同一条纪律）。
 * 有桥表码时仍合并平台自填分类（与退役前的 unspsc_level1/2 合并语义一致：两者都可被筛到）。
 */
export async function loadUnspscByNoticeIds(
  pool: Pool,
  sources: UnspscSourceRow[],
): Promise<Map<string, { backbone: string }>> {
  if (sources.length === 0) return new Map();
  const codesByNotice = new Map<string, Set<string>>();
  for (const s of sources) codesByNotice.set(s.noticeId, new Set());

  const placeholders = sources.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT notice_id, code FROM crm_bid_notice_unspsc_codes WHERE notice_id IN (${placeholders})`,
    sources.map((s) => s.noticeId),
  );
  for (const row of rows as RowDataPacket[]) {
    // 原始 8 位码（品目归属的权威输入，与 ops 回填同一张桥表同一口径）
    if (row.code) codesByNotice.get(String(row.notice_id))?.add(String(row.code).trim());
  }

  // 兜底输入键：旧字典行 id → 8 位码（整批一次查，绝不逐条点查）
  const categoryIdsByNotice = new Map<string, number[]>();
  for (const s of sources) {
    const ids = (s.categoryIds ?? []).map((v) => Number(v) || 0).filter((v) => v > 0);
    if (ids.length > 0) categoryIdsByNotice.set(s.noticeId, ids);
  }
  const dictIds = [...new Set([...categoryIdsByNotice.values()].flat())];
  if (dictIds.length > 0) {
    const codeById = await loadUnspscCodesByDictIds(pool, dictIds);
    for (const [nid, ids] of categoryIdsByNotice) {
      const set = codesByNotice.get(nid)!;
      for (const id of ids) {
        const code = codeById.get(id);
        if (code) set.add(code);
      }
    }
  }

  const final = new Map<string, { backbone: string }>();
  for (const [nid, codes] of codesByNotice) {
    const backbone = await backbonePathOfCodes(pool, codes);
    // 空集与无索引都是空串（门禁 BB7 认定空串违规），回 NULL 在 buildWideRow
    final.set(nid, { backbone: backbone ?? "" });
  }
  return final;
}

/** 旧字典行 id → 8 位 UNSPSC 码；字母容器（level=1）与悬空 id 不进结果（不臆测映射） */
async function loadUnspscCodesByDictIds(pool: Pool, dictIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, code FROM crm_unspsc_codes WHERE id IN (${dictIds.map(() => "?").join(",")})`,
    dictIds,
  );
  for (const row of rows) {
    const code = String(row.code ?? "");
    if (/^[0-9]{8}$/.test(code)) out.set(Number(row.id), code);
  }
  return out;
}

// 旧字典「候选码 → 五级 id」链路（loadPreciseByNoticeIds / getPreciseCodeMap / buildCodeLevelMap /
// PreciseLevels）已于 B1 退役：那五个 id 只服务宽表 precise_level1~5 五列，而公告分类的唯一口径
// 已是节点码 —— 精准侧由 ops 回填脚本用同一份纯函数算出 precise_backbone_path，运行期不再参与。

// ── 受援助国标准化：逐个翻译为中文 ──
function normalizeBeneficiaryCountries(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  const translated = parts.map(name => {
    const canonical = normalizeCountry(name); // 归一化为英文标准名
    return COUNTRY_NAME_ZH[canonical] || canonical; // 查中文名，未命中保留英文
  }).filter(Boolean);
  return translated.join(", ").slice(0, WIDE_LIMITS.beneficiary);
}

// ── 宽表行构建 ──
/**
 * @param unspsc 本行的品目归属（`backbone` = 节点码集合含全部祖先，由 loadUnspscByNoticeIds 算出）
 */
export function buildWideRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 宽表映射函数：源行动态多列 + 测试以扁平 mock 传参，收敛为具体类型会破坏既有测试契约
  r: any,
  aliasMap: Map<string, string>,
  unspsc?: { backbone: string },
  translations?: Record<string, WideTranslation>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 宽表行含动态列（title_<lang>/description_<lang>）与多种计算列，返回具体类型会破坏以扁平 mock 断言字段前缀的既有测试
): Record<string, any> {
  const agency = String(r.agency || "").trim();
  // 共享 normalizeCountry 始终返回英文标准名（含子国家归并、脏数据清理）
  const countryStd = normalizeCountry(String(r.country || "")).slice(0, 100);

  const agencyStd = (agency ? (aliasMap.get(agency.toUpperCase()) || agency) : "").slice(0, 200);
  const typeInfo = agencyStd && countryStd ? classifyAgencyType(agencyStd, countryStd) : null;
  // [修复] _INTL 类型国家级聚合键不一致问题：
  // classifyAgencyType(agencyStd, countryStd) 对国际机构返回国家级 typeKey
  // （如 "Brazil Committee"），但内存缓存（agencies/query.ts stage 3.6）使用
  // 通用 typeKey（如 "COMMITTEE_INTL"）。不一致导致 Meilisearch filter
  // agency_group = "COMMITTEE_INTL" 匹配不到索引中的 "Brazil Committee"。
  // 修复：对 _INTL 后缀类型，用无国家参数重新分类获取通用 typeKey，
  // 确保宽表 agency_group 与缓存 agencyGroup 一致。
  let agencyGroup = (typeInfo?.typeKey || "").slice(0, 100);
  if (typeInfo && typeInfo.typeKey.endsWith("_INTL")) {
    const genericInfo = classifyAgencyType(agencyStd);
    if (genericInfo) {
      agencyGroup = genericInfo.typeKey.slice(0, 100);
    }
  }
  const noticeTypeStd = normalizeNoticeType(r.notice_type).slice(0, 20);
  const docs = normalizeDocumentRows(r.documents, r.procurement_files);
  // 修复 030：宽表 deadline_sec 已扩容为 BIGINT UNSIGNED，不再需要 INT UNSIGNED 截断。
  // 仅保留 NaN / 负值保护（防御主表生成列异常值）。
  const rawDeadline = r.deadline_sec ? Number(r.deadline_sec) : 0;
  const deadlineSec = isNaN(rawDeadline) || rawDeadline < 0 ? 0 : rawDeadline;

  // 构建多语言翻译字段
  // PERF: 所有 description_* 截断到 WIDE_LIMITS.description，与 TEXT 列实际使用上限对齐
  const langFields: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGS) {
    const tr = translations?.[lang];
    // 同语言直通：管道只缓存了标题（description_tr 为 NULL），描述回填原文而非留空
    const sameLangNoDesc = !!tr && tr.model === TRANSLATION_MODEL.SAME_LANG && !tr.description;
    const descForLang =
      lang === "zh" && r.is_featured && r.description_cn
        ? String(r.description_cn)
        : sameLangNoDesc
          ? String(r.description ?? "")
          : String(tr?.description ?? "");
    langFields[`title_${lang}`] = truncate(tr?.title ?? "", WIDE_LIMITS.title);
    langFields[`description_${lang}`] = truncate(descForLang, WIDE_LIMITS.description);
  }

  return {
    id: Number(r.id),
    notice_id: String(r.notice_id || "").slice(0, WIDE_LIMITS.noticeId),
    title: String(r.title || "").slice(0, WIDE_LIMITS.title),
    reference: String(r.reference || "").slice(0, WIDE_LIMITS.reference),
    description: String(r.description || "").slice(0, WIDE_LIMITS.description),
    ...langFields,
    country_std: countryStd,
    agency_std: agencyStd,
    agency_group: agencyGroup,
    notice_type_std: noticeTypeStd,
    deadline_sec: deadlineSec,
    estimated_value: parseDecimalValue(r.estimated_value),
    is_featured: r.is_featured ? 1 : 0,
    entry_source: String(r.entry_source || "crawl").slice(0, 20),
    // 品目归属：只此一条口径（骨架节点码，含全部祖先）。桥表码为权威、平台自填分类兜底，
    // 两者都已在 loadUnspscByNoticeIds 里换成 8 位码并过同一份挂靠规则，此处不再合并任何旧字典 id 串。
    // 无码/无索引一律 NULL（BB7：空串算违规）；超列宽由 backbone-cache 抛错，绝不截断
    backbone_path: unspsc?.backbone ? unspsc.backbone : null,
    description_cn: String(r.description_cn || "").slice(0, WIDE_LIMITS.descriptionCn),
    bid_overview: String(r.bid_overview || "").slice(0, WIDE_LIMITS.bidOverview),
    beneficiary_countries: normalizeBeneficiaryCountries(String(r.beneficiary_countries || "")),
    documents_count: docs.length,
    published_date: String(r.published_date || "").slice(0, WIDE_LIMITS.publishedDate),
    // 指纹：与内容同快照由 SQL 侧唯一表达式算出，此处只透传不计算（I1）。
    // 缺失时落空串 → 与实时指纹不等 → 下一轮对账自动重建（自愈，无需人工刷）。
    sync_src_hash: String(r.sync_src_hash || ""),
    // 平台公告自填分类（主表列，随快照带出供 UNSPSC 兜底优先级使用）
    category_l1_id: r.category_l1_id != null ? Number(r.category_l1_id) : null,
    category_l2_id: r.category_l2_id != null ? Number(r.category_l2_id) : null,
  };
}

// ── 机构别名映射加载（带 10 分钟缓存，避免每 10 秒增量同步都查全表）──
let _aliasMapCache: Map<string, string> | null = null;
let _aliasMapExpires = 0;
const ALIAS_MAP_TTL = 10 * 60 * 1000; // 10 分钟

export async function loadAliasMap(pool: Pool): Promise<Map<string, string>> {
  if (_aliasMapCache && Date.now() < _aliasMapExpires) return _aliasMapCache;
  const aliasMap = new Map<string, string>();
  try {
    const [rows] = await pool.query("SELECT canonical, alias FROM crm_agency_aliases");
    for (const row of rows as RowDataPacket[]) {
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), String(row.canonical || "").trim());
    }
    _aliasMapCache = aliasMap;
    _aliasMapExpires = Date.now() + ALIAS_MAP_TTL;
  } catch {
    // 表不存在或查询失败：静默降级，返回旧缓存（如果有）
    if (_aliasMapCache) return _aliasMapCache;
  }
  return aliasMap;
}

// ── 批量写入宽表（宽表业务内容的唯一写入路径，I1）──
/**
 * @param withFp 是否写 sync_src_hash 列（由 isFingerprintColumn() 决定）。
 *   列缺失时必须传 false，否则整批 upsert 报 Unknown column。
 */
export async function upsertWideRows(
  pool: Pool,
  rows: Record<string, unknown>[],
  withFp: boolean,
): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let totalSynced = 0;

  // 构建语言字段列表
  const langColumns = SUPPORTED_LANGS.flatMap(lang => [`title_${lang}`, `description_${lang}`]);
  const allColumns = [
    "id", "notice_id", "title", "reference", "description",
    ...langColumns,
    "country_std", "agency_std", "agency_group", "notice_type_std",
    "deadline_sec", "estimated_value", "is_featured", "entry_source",
    // B1 起不再写旧字典分类列（unspsc_level1~5 / precise_level1~5）：列暂留 schema、历史值不再更新也无人读，
    // DROP 与 baseline 重导在 B2 走蓝绿（见 2026-10-12-notice-classification-commodity-tree-only）。
    "backbone_path",
    "description_cn", "bid_overview", "beneficiary_countries", "documents_count",
    "published_date",
    // 指纹列随内容同一行写入（同快照），因此不需要任何后续 UPDATE
    ...(withFp ? [WIDE_FP_COLUMN] : []),
  ];
  
  const placeholders = allColumns.map(() => "?").join(", ");
  const updateColumns = allColumns.filter(c => c !== "id").map(c => `${c}=VALUES(${c})`).join(", ");

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchPlaceholders = batch.map(() => `(${placeholders})`).join(",");
    const params: unknown[] = [];
    for (const row of batch) {
      params.push(
        row.id, row.notice_id, row.title, row.reference, row.description,
        ...SUPPORTED_LANGS.flatMap(lang => [row[`title_${lang}`], row[`description_${lang}`]]),
        row.country_std, row.agency_std, row.agency_group, row.notice_type_std,
        row.deadline_sec, row.estimated_value, row.is_featured, row.entry_source,
        // 列清单与这里的取值必须同批增减（多一个少一个都是 Unknown column / 参数错位）
        row.backbone_path,
        row.description_cn, row.bid_overview, row.beneficiary_countries, row.documents_count,
        row.published_date,
        ...(withFp ? [row[WIDE_FP_COLUMN]] : []),
      );
    }
    await pool.query(
      `INSERT INTO crm_notice_search (${allColumns.join(", ")}) VALUES ${batchPlaceholders}
      ON DUPLICATE KEY UPDATE ${updateColumns}`,
      params,
    );
    totalSynced += batch.length;
  }

  // 节点码倒排表：跟本批宽表行同批写（已比过指纹，没变的 id 一次写都不发）。
  // 失败为什么不一道抛出：宽表行已经落库，拖上 Meili 级联与重试队列的不能是这个派生表；
  // 但也绝不静默 —— 这里必报 error，且门禁 BB14 / 对账里的节点码漂移检测会持续报同一条。
  try {
    await upsertNoticeNodes(
      pool,
      rows.map((r) => ({ id: Number(r.id), backbone_path: (r.backbone_path as string | null) ?? null })),
    );
  } catch (err) {
    console.error(
      `[notice-nodes] 本批 ${rows.length} 条公告的节点码写入失败（不阻断宽表同步）:`,
      (err as Error).message,
    );
  }
  return totalSynced;
}
