/**
 * 宽表行构建器 + 数据加载
 * Wide Row Builder & Data Loading
 *
 * @module server/services/search-sync/wide-row-builder
 * @description 负责 notice_search 宽表的数据加载、行构建、deadline 对账和批量写入。
 *              与 sync-scheduler.ts（调度层）分离，实现数据构建与同步时机的解耦。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { resolveCountries } from "../country/resolve";
import type { CountryAliasSnapshot } from "../country/alias-store";
import { toBackbonePathColumn } from "../commodity/backbone-path";
import { pathOfLandingNodes } from "../commodity/attribution";
import { DESC_SOURCE_EXPR, WIDE_LIMITS, TRANSLATION_MODEL, truncate } from "../../utils/notice-field-limits";
import { WIDE_FP_EXPR, WIDE_FP_COLUMN } from "./wide-fingerprint";
// JOIN 片段来自叶子模块 wide-sync-sql：不得在本文件定义后再被 fingerprint 反向导入（会成环）
import { WIDE_OPP_JOIN, WIDE_SYNC_JOIN } from "./wide-sync-sql";
import { upsertNoticeNodes } from "./notice-nodes";
import { SUPPORTED_LANGS } from "../../utils/languages";
import { loadAgencyAliasSnapshot } from "../agency/alias-store";

export { WIDE_OPP_JOIN, WIDE_SYNC_JOIN };

// ── 支持的语言列表：唯一来源 utils/languages；本地 import 供本文件使用，此处再导出维持 search-sync barrel 兼容 ──
export { SUPPORTED_LANGS };

// ── 对账逻辑已拆至 wide-row-reconcile.ts ──

// ── 批量写入宽表 ──

// ── 同步 SQL（含所有语言翻译，不含旧品类码）──
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
  SELECT n.id, n.notice_id, p.reference, p.title,
         ${withFp ? `${WIDE_FP_EXPR} AS ${WIDE_FP_COLUMN},` : ""}
         p.description AS description,
         n.country, n.agency, n.agency_full, n.notice_type, n.deadline_sec,
         n.is_featured,
         n.estimated_value, n.documents, n.procurement_files,
         n.published_date, n.entry_source,
         p.description_cn, LEFT(opp.bid_overview, ${WIDE_LIMITS.bidOverview}) AS bid_overview,
         opp.beneficiary_countries,
         p.beneficiary_countries AS public_beneficiary_countries,
         p.buyer_name, p.buyer_group, n.country AS country_name,
         p.is_opportunity,
         p.country_codes AS public_country_codes,
         p.notice_type_code, p.deadline_ts,
         p.estimated_value AS public_estimated_value,
         p.updated_at AS public_updated_at
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
     FROM notice_translations
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

// ── 品目归属装载（按 notice_pk 从落点表取最深落点）──
/**
 * 一行的归属输入：`pk` 是 notice_attribution_nodes.notice_pk 的连接键；
 * `noticeId` 仅作返回 Map 的 key 用（buildWideRow 按它取本行的 backbone）。
 * 旧品类桥表读取路径已随小表剥离删除（2026-10-14）——归属唯一事实源是落点表。
 */
export interface AttributionSourceRow {
  /** 桥表外部编号（= bid_notices.notice_id）；返回 Map 以此 key */
  noticeId: string;
  /** 主表自增 id（= notice_attribution_nodes.notice_pk）；按它取最深落点 */
  pk?: number;
}

/**
 * 品目归属装载的唯一入口（sync-scheduler 只调这一个）：按 notice_pk 读
 * notice_attribution_nodes 落点表 → 最深落点 → 服务端补祖先 → 列形制。
 * 无 pk 的调用方 / 落点表无该公告行 ⇒ 结果缺席 ⇒ buildWideRow 写 NULL
 * （分类缺席，靠 BB16 覆盖率 WARN 暴露，不臆测、不兜桥表）。
 * 归属换源不改列形制：值仍是「含全部祖先的节点码集，ASCII 逗号分隔」。
 */
export async function loadBackboneMap(
  pool: Pool,
  sources: AttributionSourceRow[],
): Promise<Map<string, { backbone: string }>> {
  if (sources.length === 0) return new Map();
  const byPk = new Map<number, string>(); // notice_pk -> notice_id
  for (const s of sources) if (s.pk) byPk.set(s.pk, s.noticeId);
  const pks = [...byPk.keys()];
  if (pks.length === 0) return new Map(); // 全部缺 pk：结果整体缺席，交上游写 NULL
  const [rows] = await pool.query(
    `SELECT notice_pk, node_code FROM notice_attribution_nodes WHERE notice_pk IN (${pks.map(() => "?").join(",")})`,
    pks,
  );
  const nodesByPk = new Map<number, string[]>();
  for (const row of rows as RowDataPacket[]) {
    const arr = nodesByPk.get(Number(row.notice_pk));
    if (arr) arr.push(String(row.node_code));
    else nodesByPk.set(Number(row.notice_pk), [String(row.node_code)]);
  }
  const final = new Map<string, { backbone: string }>();
  for (const [pk, nid] of byPk) {
    const codes = nodesByPk.get(pk);
    // 落点集 → 含全部祖先的节点码集；空集→空串→buildWideRow 写 NULL
    final.set(nid, { backbone: codes && codes.length ? toBackbonePathColumn(pathOfLandingNodes(codes)) : "" });
  }
  return final;
}

// 旧字典「候选码 → 五级 id」链路（loadPreciseByNoticeIds / getPreciseCodeMap / buildCodeLevelMap /
// PreciseLevels）已于 B1 退役：那五个 id 只服务宽表 precise_level1~5 五列，而公告分类的唯一口径
// 已是节点码 —— 精准侧由 ops 回填脚本用同一份纯函数算出 precise_backbone_path，运行期不再参与。

// ── 受援助国标准化：一切以 country_aliases 为准（表驱动拆多国 + 表内中文名）──
function normalizeBeneficiaryCountries(raw: string, snapshot?: CountryAliasSnapshot): string {
  if (!raw || !snapshot) return "";
  const refs = resolveCountries(raw, snapshot).refs.filter((r) => r.kind === "country");
  return refs.map((r) => r.zh || r.canonical).filter(Boolean).join(", ").slice(0, WIDE_LIMITS.beneficiary);
}

// ── 宽表行构建（②投影层）──
/**
 * @param landing 本行的品目归属（`backbone` = 节点码集合含全部祖先，由 loadBackboneMap 从落点表算出）
 *
 * 2026-10-27 管道翻转：归一化字段（买家/类型分组/国家/金额/截止）不再是本层计算，
 * 而是投影自服务表 notice_public（①归一层，SELECT 里 WIDE_PUBLIC_JOIN 带出）。
 * 本层只补检索专有字段：多语翻译、品目归属、商机富化、受援国展示形。
 */
export function buildWideRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 宽表映射函数：源行动态多列 + 测试以扁平 mock 传参，收敛为具体类型会破坏既有测试契约
  r: any,
  landing?: { backbone: string },
  translations?: Record<string, WideTranslation>,
  countrySnap?: CountryAliasSnapshot,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 宽表行含动态列（title_<lang>/description_<lang>）与多种计算列，返回具体类型会破坏以扁平 mock 断言字段前缀的既有测试
): Record<string, any> {
  // ── 归一化字段：服务表现成值直拷（投影）──
  // LEFT JOIN 未命中（未准入行 / ① 尚未构建）时为空值：草稿行本就不该有对外 facet；
  // 交付顺序由调度保证（主表 → ① → ②），缺行由指纹对账（p.updated_at 段）自愈。
  const buyerName = String(r.buyer_name ?? "").slice(0, 200);
  const buyerGroup = String(r.buyer_group ?? "").slice(0, 100);
  const countryName = String(r.country_name ?? "").slice(0, 100);
  let countryCodes = "";
  if (typeof r.public_country_codes === "string" && r.public_country_codes) {
    try {
      const arr = JSON.parse(r.public_country_codes);
      if (Array.isArray(arr)) {
        countryCodes = [...new Set(arr.map(String).filter((c) => /^[A-Z]{2}$/.test(c)))].join(",");
      }
    } catch { /* JSON 损坏按空处理：指纹含 p.updated_at，下一轮对账整行重建 */ }
  }
  const noticeTypeCode = String(r.notice_type_code ?? "").slice(0, 20);
  const docs = normalizeDocumentRows(r.documents, r.procurement_files);
  // 截止投影自服务表 deadline_ts（deadline 旁表语义：effective_ts 优先、typo/unknown 置空）。
  // 仅保留 NaN / 负值保护（宽表列为 BIGINT UNSIGNED）。
  const rawDeadline = r.deadline_ts != null ? Number(r.deadline_ts) : 0;
  const deadlineSec = Number.isFinite(rawDeadline) && rawDeadline > 0 ? rawDeadline : 0;
  // 金额投影自服务表：预算保密行在 ① 已整体置空 ⇒ 搜索金额/排序同口径不泄露；
  // DECIMAL 字符串直接 Number，畸形/负值落 0。
  const parsedValue = r.public_estimated_value == null ? 0 : Number(r.public_estimated_value);
  const estimatedValue = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;

  // 构建多语言翻译字段
  // PERF: 所有 description_* 截断到 WIDE_LIMITS.description，与 TEXT 列实际使用上限对齐
  const langFields: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGS) {
    const tr = translations?.[lang];
    // 同语言直通：管道只缓存了标题（description_tr 为 NULL），描述回填原文而非留空
    const sameLangNoDesc = !!tr && tr.model === TRANSLATION_MODEL.SAME_LANG && !tr.description;
    const descForLang =
      lang === "zh" && r.description_cn
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
    country_name: countryName,
    country_codes: countryCodes,
    buyer_name: buyerName,
    buyer_group: buyerGroup,
    notice_type_code: noticeTypeCode,
    deadline_sec: deadlineSec,
    estimated_value: estimatedValue,
    is_featured: r.is_featured ? 1 : 0,
    is_opportunity: r.is_opportunity ? 1 : 0,
    entry_source: String(r.entry_source || "crawl").slice(0, 20),
    // 品目归属：只此一条口径（骨架节点码，含全部祖先），事实源是 notice_attribution_nodes
    // 落点表（loadBackboneMap 唯一装载入口）；无落点/无 pk ⇒ NULL（BB7：空串算违规），不退回桥表。
    backbone_path: landing?.backbone ? landing.backbone : null,
    description_cn: String(r.description_cn || "").slice(0, WIDE_LIMITS.descriptionCn),
    bid_overview: String(r.bid_overview || "").slice(0, WIDE_LIMITS.bidOverview),
    beneficiary_countries: String(r.public_beneficiary_countries || r.beneficiary_countries || "").slice(0, WIDE_LIMITS.beneficiary),
    documents_count: docs.length,
    published_date: String(r.published_date || "").slice(0, WIDE_LIMITS.publishedDate),
    // 指纹：与内容同快照由 SQL 侧唯一表达式算出，此处只透传不计算（I1）。
    // 缺失时落空串 → 与实时指纹不等 → 下一轮对账自动重建（自愈，无需人工刷）。
    sync_src_hash: String(r.sync_src_hash || ""),
  };
}

// ── 机构别名映射：委托共享 store（缓存/归一/降级唯一在 agency/alias-store）──
/**
 * 兼容既有调用方与测试契约：返回 alias(归一大写) → canonical。
 * 缓存与降级由 store 统一负责（10 分钟 TTL；查库失败且无缓存→空 Map）。
 */
export async function loadAliasMap(pool: Pool): Promise<Map<string, string>> {
  const snap = await loadAgencyAliasSnapshot(pool);
  const m = new Map<string, string>();
  for (const [key, entry] of snap.byAlias) m.set(key, entry.canonical);
  return m;
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
    "country_name", "country_codes", "buyer_name", "buyer_group", "notice_type_code",
    "deadline_sec", "estimated_value", "is_featured", "is_opportunity", "entry_source",
    // B1 起不再写旧字典分类列（旧五级列~5 / precise_level1~5）：列暂留 schema、历史值不再更新也无人读，
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
        row.country_name, row.country_codes, row.buyer_name, row.buyer_group, row.notice_type_code,
        row.deadline_sec, row.estimated_value, row.is_featured, row.is_opportunity, row.entry_source,
        // 列清单与这里的取值必须同批增减（多一个少一个都是 Unknown column / 参数错位）
        row.backbone_path,
        row.description_cn, row.bid_overview, row.beneficiary_countries, row.documents_count,
        row.published_date,
        ...(withFp ? [row[WIDE_FP_COLUMN]] : []),
      );
    }
    await pool.query(
      `INSERT INTO notice_search (${allColumns.join(", ")}) VALUES ${batchPlaceholders}
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
