/**
 * 服务表 notice_public 构建核心（唯一写入者代码路径）。
 *
 * 2026-10-27 管道翻转（主表 → ①服务表 → ②宽表 → Meili）：服务表从"ops 本机脚本第三棒"
 * 升级为应用内归一层，构建逻辑从当日的本机一次性 ops 脚本（gitignore、仅存本机、
 * standalone 部署缺失即静默跳过；后随翻转落地删除）抽入本模块——仓库内可审、生产可跑、
 * 换机不丢。门禁 check-notice-public-ssot 的 N1/N2 以本文件为唯一基准。
 *
 * 归一化口径：买家/国家/机构类型走 notice-normalize/notice-core（买家实体匹配走
 * buyer/entity-index，以 buyer_alias ⋈ buyer 为唯一权威；旧 agency_aliases 体系已退役）；
 * 金额/联系方式/标题/正文分级在本模块内完成，产出即对外事实。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { normalizeTitle, cleanContentText } from "../notice-content/title";
import { normalizeAmount } from "../notice-normalize/amount";
import { normalizeContacts } from "../notice-normalize/phone";
import { resolveCountries } from "../country/resolve";
import { normalizeBuyerCountry } from "../notice-normalize/notice-core";
import { normalizeIndustry } from "../notice-normalize/industry";
import { loadBuyerEntityIndex, resolveBuyerEntity, type BuyerEntityIndex } from "../buyer/entity-index";
import { loadCountryAliasSnapshot } from "../country/alias-store";
import type { CountryAliasSnapshot } from "../country/alias-store";
import { classifyBareContractNotice, normalizeNoticeType } from "../../utils/notice-type";
import { normalizeDocumentRows } from "../../utils/normalize";
import { STABLE_EXPIRED_WHERE, isStablyExpired } from "../../utils/notice-expired";
import {
  parseSourceDateParts,
  sourceDateWallSeconds,
  SOURCE_DATE_PROFILES,
} from "@/shared/utils/notice-datetime/source-date";
import { sanitizeEpochSec } from "@/shared/utils/unixTs";
import { buildShareSummary } from "./share-summary";
import { loadBackboneMap } from "../commodity/backbone-loader";

/**
 * 一次性数据治理：把服务表 industry 的旧值归一为 canonical slug（唯一写入者纪律）。
 *
 * 2026-11-18 决策：剔除「采购主题 slug → GB/T 行业门类」桥接后，历史行里残留的
 * UGT-I 行业树码 / 中文别名需要回写为 canonical slug（或 NULL）。
 * N1 门禁要求 notice_public 只能由本模块写入，因此治理逻辑放这里，CLI 脚本只调用本函数。
 *
 * @param apply false 时只统计待更新行数（DRY）
 */
export async function normalizePublicIndustryColumn(
  pool: Pool,
  opts: { apply?: boolean; chunkSize?: number } = {},
): Promise<{ scanned: number; updated: number }> {
  const apply = opts.apply === true;
  const chunk = Math.max(100, Math.min(opts.chunkSize ?? 1000, 5000));
  let lastPk = 0;
  let scanned = 0;
  let updated = 0;
  for (;;) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.notice_pk, p.industry AS current_industry, n.industry AS raw_industry
         FROM notice_public p
         JOIN bid_notices n ON n.id = p.notice_pk
        WHERE p.notice_pk > ?
        ORDER BY p.notice_pk
        LIMIT ?`,
      [lastPk, chunk],
    );
    if (rows.length === 0) break;
    const pending: Array<[number, string | null]> = [];
    for (const row of rows) {
      const expected = normalizeIndustry(row.raw_industry);
      const current = row.current_industry == null ? null : String(row.current_industry);
      if ((current ?? null) !== (expected ?? null)) pending.push([Number(row.notice_pk), expected]);
    }
    scanned += rows.length;
    updated += pending.length;
    if (scanned % 100_000 < chunk) {
      console.log(`[normalize-industry] 进度：扫描 ${scanned} 行，待/已更新 ${updated} 行`);
    }
    lastPk = Number(rows[rows.length - 1].notice_pk);
    if (!apply || pending.length === 0) continue;
    const when = pending.map(() => "WHEN ? THEN ?").join(" ");
    const params: unknown[] = [];
    for (const [pk, value] of pending) params.push(pk, value);
    const inMarks = pending.map(() => "?").join(",");
    params.push(...pending.map(([pk]) => pk));
    await pool.query(
      `UPDATE notice_public SET industry = CASE notice_pk ${when} END WHERE notice_pk IN (${inMarks})`,
      params,
    );
  }
  return { scanned, updated };
}

/**
 * 回填分享卡摘要（历史行）——只补 `share_summary IS NULL` 的行。
 *
 * 构建器只覆盖「被重新选中构建」的行，存量 53 万行不会因为加列自动有值；
 * 本函数按 notice_pk 游标分批读正文、用 buildShareSummary 生成并写回。
 * 抽不出可用文本的行保持 NULL（读侧回退标题），下次运行会再次扫描。
 *
 * @param apply false 时只统计待回填行数（DRY）
 * @param limit 只处理前 N 行（本地抽样验证用）
 */
export async function backfillShareSummaries(
  pool: Pool,
  opts: { apply?: boolean; chunkSize?: number; limit?: number } = {},
): Promise<{ scanned: number; updated: number }> {
  const apply = opts.apply !== false;
  const chunk = Math.max(100, Math.min(opts.chunkSize ?? 500, 2000));
  const limit = opts.limit && opts.limit > 0 ? opts.limit : Number.POSITIVE_INFINITY;
  let lastPk = 0;
  let scanned = 0;
  let updated = 0;
  while (scanned < limit) {
    const take = Math.min(chunk, limit - scanned);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT notice_pk, title, title_cn, description, description_cn
         FROM notice_public
        WHERE notice_pk > ? AND (share_summary IS NULL OR share_summary_en IS NULL)
        ORDER BY notice_pk
        LIMIT ?`,
      [lastPk, take],
    );
    if (rows.length === 0) break;
    const pending: Array<[number, string | null, string | null]> = [];
    for (const row of rows) {
      const summary = buildShareSummary({
        title: row.title == null ? null : String(row.title),
        titleCn: row.title_cn == null ? null : String(row.title_cn),
        description: row.description == null ? null : String(row.description),
        descriptionCn: row.description_cn == null ? null : String(row.description_cn),
      });
      if (summary.zh || summary.en) pending.push([Number(row.notice_pk), summary.zh, summary.en]);
    }
    scanned += rows.length;
    updated += pending.length;
    lastPk = Number(rows[rows.length - 1].notice_pk);
    if (scanned % 50_000 < chunk) {
      console.log(`[share-summary] 进度：扫描 ${scanned} 行，已回填 ${updated} 行`);
    }
    if (!apply || pending.length === 0) continue;
    const when = pending.map(() => "WHEN ? THEN ?").join(" ");
    const inMarks = pending.map(() => "?").join(",");
    const pks = pending.map(([pk]) => pk);
    const zhParams: unknown[] = [];
    for (const [pk, zh] of pending) zhParams.push(pk, zh);
    zhParams.push(...pks);
    await pool.query(
      `UPDATE notice_public SET share_summary = CASE notice_pk ${when} END WHERE notice_pk IN (${inMarks})`,
      zhParams,
    );
    const enParams: unknown[] = [];
    for (const [pk, , en] of pending) enParams.push(pk, en);
    enParams.push(...pks);
    await pool.query(
      `UPDATE notice_public SET share_summary_en = CASE notice_pk ${when} END WHERE notice_pk IN (${inMarks})`,
      enParams,
    );
  }
  return { scanned, updated };
}

/**
 * 可重复治理：商机行的服务表 `industry` 以 `bid_opportunities.industry` 为准。
 *
 * 背景：商机行业由运营/商机侧维护（canonical 采购主题），比公告主表行业更可信；
 * 构建器 `buildPublicRow` 已对可重建行优先取商机行业，本函数兜底处理构建器
 * 不再准入的存量服务行（按 id 重建会跳过、旧值回不去），保证两表口径一致。
 *
 * @param apply false 时只统计待更新行数（DRY）
 */
export async function syncPublicIndustryFromOpportunity(
  pool: Pool,
  opts: { apply?: boolean; chunkSize?: number } = {},
): Promise<{ scanned: number; pending: number; updated: number }> {
  const apply = opts.apply === true;
  const chunk = Math.max(100, Math.min(opts.chunkSize ?? 1000, 5000));
  let lastPk = 0;
  let scanned = 0;
  let pending = 0;
  let updated = 0;
  for (;;) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.notice_pk, p.industry AS current_industry,
              (SELECT o.industry
                 FROM bid_opportunities o
                WHERE (o.id = n.converted_opp_id OR o.source_notice_id = n.notice_id)
                  AND o.industry IS NOT NULL AND o.industry <> ''
                ORDER BY (o.id = n.converted_opp_id) DESC, o.id DESC
                LIMIT 1) AS target_industry
         FROM notice_public p
         JOIN bid_notices n ON n.id = p.notice_pk
        WHERE p.is_opportunity = 1
          AND p.notice_pk > ?
        ORDER BY p.notice_pk
        LIMIT ?`,
      [lastPk, chunk],
    );
    if (rows.length === 0) break;
    const updates: Array<[number, string]> = [];
    for (const row of rows) {
      const expected = normalizeIndustry(row.target_industry);
      const current = row.current_industry == null ? null : String(row.current_industry);
      if (expected !== null && current !== expected) updates.push([Number(row.notice_pk), expected]);
    }
    scanned += rows.length;
    pending += updates.length;
    if (scanned % 100_000 < chunk) {
      console.log(`[sync-opportunity-industry] 扫描 ${scanned} 行，待更新 ${pending} 行`);
    }
    lastPk = Number(rows[rows.length - 1].notice_pk);
    if (!apply || updates.length === 0) continue;
    const when = updates.map(() => "WHEN ? THEN ?").join(" ");
    const params: unknown[] = [];
    for (const [pk, value] of updates) params.push(pk, value);
    const inMarks = updates.map(() => "?").join(",");
    params.push(...updates.map(([pk]) => pk));
    await pool.query(
      `UPDATE notice_public SET industry = CASE notice_pk ${when} END WHERE notice_pk IN (${inMarks})`,
      params,
    );
    updated += updates.length;
  }
  return { scanned, pending, updated };
}

/**
 * 一次性数据治理：买家实体合并后，把服务表里指向被合并实体的行改挂到留存实体。
 *
 * 背景（2026-11-23 买家实体归一）：历史批次给同一「同国 + 同归一名」机构重复建档，
 * 合并时 buyer_alias 迁到留存实体、重复实体置 inactive，但服务表的 buyer_id 仍指向
 * 已停用的重复实体——详情/筛选会显示一个不在实体索引里的机构。N1 门禁要求
 * notice_public 只能由本模块写入，因此改挂逻辑放这里，CLI
 * （scripts/tools/buyer-normalize-repair.ts）只调用本函数。
 *
 * buyer_name 一并按留存实体的 canonical 重写：它是构建期 resolveBuyerEntity 的产出，
 * 只改 buyer_id 不改名字会与「下次重建」的口径分叉。留存实体没有中文名时保留行上已有
 * 的音译/译名（不拿 NULL 清空有效数据），与构建器 `buyerEntity.nameZh ?? null` 的取舍
 * 差异只在「合并时留存实体缺译名」这一种情况，属于宁可保留旧译名的修复口径。
 *
 * B2 门禁要求 buyer/buyer_alias 只能经 buyer/entity-index 读取，因此本函数**不读 buyer 表**：
 * 留存实体的 canonical / name_zh 由调用方（CLI 已在同一事务里读过 buyer 行）传入。
 *
 * @param q 连接或连接池；需要与 buyer_alias/buyer 的迁移同事务时传 PoolConnection
 * @returns 受影响的服务表行数
 */
export async function reassignPublicBuyer(
  q: Pick<Pool, "query">,
  opts: { fromBuyerId: number; toBuyerId: number; canonicalName: string; nameZh?: string | null },
): Promise<number> {
  const from = Number(opts.fromBuyerId);
  const to = Number(opts.toBuyerId);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to <= 0 || from === to) {
    throw new Error(`reassignPublicBuyer: 非法实体 id from=${opts.fromBuyerId} to=${opts.toBuyerId}`);
  }
  const canonical = String(opts.canonicalName ?? "").trim();
  if (!canonical) throw new Error(`reassignPublicBuyer: 留存实体 ${to} 缺少 canonical 名`);
  const nameZh = String(opts.nameZh ?? "").trim();
  const [res] = await q.query(
    `UPDATE notice_public
        SET buyer_id = ?,
            buyer_name = ?,
            buyer_name_cn = COALESCE(NULLIF(?, ''), buyer_name_cn)
      WHERE buyer_id = ?`,
    [to, canonical.slice(0, 500), nameZh.slice(0, 500), from],
  );
  return (res as ResultSetHeader).affectedRows;
}

// ── 准入红线（2026-10-22 用户拍板，选行/构建/清理三处共用同一谓词）──────────────
// 服务表是对外表：平台自录 RFQ 仅「发布过」（published/closed）可进——草稿/待审/驳回
// 从未公开，rfq_status 为 NULL 的平台行视为未发布一并排除；定向可见（visibility<>public）
// 不进；爬虫/API 来源（entry_source<>'platform'）不受 rfq_status 约束（本就是公开抓取）。
// [2026-11-13 构建时摘除] 稳定过期（截止已过且超清退余量 30 天）不再准入：过了余量的
// 行由 selectPublicGhostIds 的 NOT(admit) 分支从服务表清退，宽表/Meili 经各自 ghost 链
// 跟退；主表不动，源站延期复活由 missing 分支自动重建（口径见 utils/notice-expired）。
export const PUBLIC_ADMIT_SQL = `(n.entry_source <> 'platform' OR n.rfq_status IN ('published','closed'))
   AND IFNULL(n.visibility, 'public') = 'public'
   AND NOT ${STABLE_EXPIRED_WHERE}`;

/** 服务表列清单（= baseline.sql 的 notice_public 列集，门禁 N2 逐列比对） */
export const PUBLIC_COLS = [
  "notice_pk", "notice_id", "source_url", "reference",
  "title", "title_cn", "description", "description_cn", "content_level", "industry",
  "published_ts", "deadline_ts", "deadline_state", "deadline_type", "deadline_timezone", "timezone_source",
  "country_code", "country_codes", "notice_type_code",
  "platform_name",
  "buyer_name", "buyer_id", "buyer_name_cn",
  "estimated_value", "currency_code",
  "contacts", "attachments", "external_links",
  "registration_level", "beneficiary_countries",
  "supplier_conditions", "eligibility", "technical_hurdles",
  "updated_at", "is_opportunity",
  "share_summary", "share_summary_en",
  // 宽表退役（2026-11-28）：英文译文 + 品目骨架路径，与 notice_search 同形制，
  // 让检索/展示读源可以整体切到服务表。列序必须与 baseline.sql 一致（门禁 N2）。
  "title_en", "description_en", "backbone_path",
] as const;

interface PlatformEntry { code: string; name: string }

/** 平台别名归一键（平台表自己的口径，与买家归一键刻意分开） */
function normalizePlatformKey(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** 构建上下文：买家实体索引/平台快照一次性装载，批间复用 */
export interface PublicBuildContext {
  countrySnap: CountryAliasSnapshot;
  platformByHost: Map<string, PlatformEntry>;
  platformByAlias: Map<string, PlatformEntry>;
  /** 买家实体索引（buyer_alias ⋈ buyer；原始写法 → 实体的唯一匹配入口） */
  buyerIndex: BuyerEntityIndex;
}

export async function loadPublicBuildContext(pool: Pool): Promise<PublicBuildContext> {
  const countrySnap = await loadCountryAliasSnapshot(pool);
  const platformByHost = new Map<string, PlatformEntry>();
  const platformByAlias = new Map<string, PlatformEntry>();
  const [rows] = await pool.query(
    `SELECT canonical, platform_code, alias, normalized_alias, host
       FROM platform_aliases WHERE is_active=1`,
  );
  for (const r of rows as RowDataPacket[]) {
    const entry: PlatformEntry = { code: String(r.platform_code ?? ""), name: String(r.canonical ?? "") };
    if (!entry.code || !entry.name) continue;
    const host = String(r.host ?? "").toLowerCase().replace(/^www\./, "");
    if (host) platformByHost.set(host, entry);
    for (const a of [r.alias, r.normalized_alias]) {
      const key = normalizePlatformKey(a);
      if (key) platformByAlias.set(key, entry);
    }
  }
  // [2026-10-31 机构口径收敛] 买家实体索引 = 唯一机构匹配口径；旧 agency_aliases 不再参与构建。
  const buyerIndex = await loadBuyerEntityIndex(pool);
  if (buyerIndex.stats.ambiguousKeys > 0) {
    console.warn(
      `[notice-public] buyer 实体索引存在同国同归一键冲突 ${buyerIndex.stats.ambiguousKeys} 组，` +
      `这些写法本轮不解析（保留原始名、进候选队列），待人工合并别名后重建`,
    );
  }
  return { countrySnap, platformByHost, platformByAlias, buyerIndex };
}

function extractUrl(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : s;
}

function platformOf(ctx: PublicBuildContext, url: unknown, agency: unknown, organization: unknown): PlatformEntry | null {
  let host = "";
  try { host = new URL(extractUrl(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* ignore */ }
  if (host) {
    const exact = ctx.platformByHost.get(host);
    if (exact) return exact;
    for (const [h, e] of ctx.platformByHost) if (host.endsWith(`.${h}`)) return e;
    // 未登记平台：用源站域名兜底，优于 NULL
    return { code: "", name: host };
  }
  for (const raw of [agency, organization]) {
    const key = normalizePlatformKey(raw);
    if (key && ctx.platformByAlias.has(key)) return ctx.platformByAlias.get(key)!;
  }
  return null;
}

/**
 * 构建期宽入口径：任意源值 → UTC 秒。
 *
 * 2026-11-13 收敛：识别交给 `shared/utils/notice-datetime/source-date.ts`（全仓唯一实现）。
 * build profile 保留旧 toEpoch 的三条宽口契约（金样 zero-diff）：
 *   - 数字串 10~13 位直取，>1e11 视为毫秒
 *   - 残尾忽略（`2026-10-19 09:00 (UTC+02:00)` 取前缀、偏移不换算）
 *   - Date.parse 兜底
 * 另保留两条**待退役**的旧口径（阶段 3 处理，见 source-date.ts 的 legacy 说明）：
 *   - ISO 时刻只认 2 位小时（`2:00:00 PM` 只取日期）
 *   - D-Mon 一律丢时分（`31-Dec-2026 23:59` → 当天 00:00）
 */
export function toEpoch(v: unknown): number | null {
  if (v == null || v === "") return null;
  const parts = parseSourceDateParts(
    typeof v === "number" ? v : String(v),
    SOURCE_DATE_PROFILES.build,
  );
  return parts ? sourceDateWallSeconds(parts) : null;
}

/**
 * 输入水位（`bid_notices.update_time` 等）只接受合法 epoch 秒。
 *
 * 主表存在 `YYYYMMDDHHMMSS` 形态的脏值（实测 83 行 = `20261030012753`）：`toEpoch` 会把
 * 11/14 位数字当 epoch 秒原样返回，直接进 `Math.max` 就会写进 `notice_public.updated_at`，
 * 再被 sitemap 的 `lastmod` 与页面 JSON-LD 的 `dateModified` 格式化成「2612 年」。
 * 脏值一律当 0，最终由 `|| now` 兜底。
 */
function toWatermark(v: unknown): number {
  return sanitizeEpochSec(toEpoch(v));
}


function normRegistration(raw: unknown): string | null {
  const s = String(raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!s) return "unknown";
  if (s.includes("basic") || s.includes("基础")) return "basic";
  if (s.includes("level1") || s.includes("l1")) return "level1";
  if (s.includes("level2") || s.includes("l2")) return "level2";
  if (s.includes("level3") || s.includes("l3")) return "level3";
  if (s.includes("medium")) return "medium";
  if (s.includes("high")) return "high";
  if (s.includes("standard")) return "standard";
  return "unknown";
}

/** 平台默认币种：源库 currency 列大量是占位 CNY，不能直接采用；按平台/国家补。 */
function inferPlatformCurrency(platformName: string | null | undefined): string | null {
  const p = String(platformName ?? "").trim();
  if (p === "EJN Montenegro") return "EUR";
  if (p === "BUTB") return "BYN";
  if (p === "Kyrgyz e-Procurement" || p === "OKMOT") return "KGS";
  if (p === "Mongolia e-Procurement") return "MNT";
  if (p === "TED") return "EUR";
  if (p === "Find a Tender") return "GBP";
  if (p === "UNGM" || p === "World Bank" || p === "ADB" || p === "IFAD") return "USD";
  if (p === "GIZ") return "EUR";
  if (p === "Umucyo") return "RWF";
  if (p === "Türkmennebit") return "TMT";
  if (p === "ITP Iraq") return "IQD";
  if (p === "PPCC Liberia") return "LRD";
  return null;
}

const len = (s: unknown) => String(s ?? "").trim().length;
const echo = (desc: unknown, title: unknown) =>
  String(desc ?? "").trim().slice(0, 25) === String(title ?? "").trim().slice(0, 25);

/** 文件型 URL：外链里命中这些扩展名的，应归入 attachments。 */
const FILE_URL_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|rtf|odt|ods)(?:[?#]|$)/i;
const isFileUrl = (url: string) => FILE_URL_RE.test(url);

/** 附件去重：同一 URL + 文件名只保留第一条；同一下载入口对应不同文件名时不能合并。 */
function dedupeDocuments(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return rows.filter((d) => {
    const url = String(d.url ?? "").trim().toLowerCase();
    const name = String(d.name ?? d.title ?? "").trim().toLowerCase();
    const key = url ? `${url}|${name}` : name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 输入行装载：主表 + 标题/正文/截止旁表 + 附件旁表 + 商机侧 ────────────────
export interface PublicInputBatch {
  rows: RowDataPacket[];
  attachmentMap: Map<number, Array<Record<string, unknown>>>;
  oppMap: Map<string, {
    title: string | null; industry: string | null; beneficiary: string | null;
    sc: string | null; eh: string | null; th: string | null;
  }>;
  /** 商机侧两组水位映射（updated_at 取输入 max 的依据，保证商机侧选行收敛） */
  oppWmByNotice: Map<string, number>;
  oppWmById: Map<number, number>;
  /** 品目骨架路径（notice_id → 含全部祖先的节点码串；宽表退役后服务表自持） */
  backboneMap: Map<string, { backbone: string }>;
}

export async function fetchPublicInputRows(pool: Pool, chunk: number[]): Promise<PublicInputBatch> {
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id, n.reference, n.url, n.title, n.description, n.published_date,            n.deadline_sec, n.country, n.notice_type, n.agency, n.agency_full, n.organization,
            n.contacts, n.contact_phone, n.contact_email, n.currency, n.estimated_value,
            n.documents, n.procurement_files, n.external_links, n.registration_level,
            n.entry_source, n.industry, n.beneficiary_countries, n.is_featured, n.converted_opp_id,
            n.rfq_status, n.visibility, n.budget_confidential,
            CASE
              WHEN EXISTS (
                SELECT 1 FROM bid_opportunities o
                 WHERE (o.id = n.converted_opp_id OR o.source_notice_id = n.notice_id)
                   AND (o.is_qualified = 1 OR o.status = 1 OR o.audit_status = 1)
              ) THEN 1
              ELSE 0
            END AS is_opportunity,
            n.update_time,
            t.title_clean, t.title_quality, t.updated_at AS title_updated_at,
            b.body_text, b.body_chars, b.content_level,
            d.deadline_state, d.deadline_type, d.deadline_timezone, d.timezone_source, d.effective_ts, d.confidence,
            tr.title_tr AS title_cn, tr.description_tr AS description_cn_tr,
            tre.title_tr AS title_en, tre.description_tr AS description_en
       FROM bid_notices n
       LEFT JOIN notice_title t ON t.notice_pk=n.id
       LEFT JOIN notice_body b ON b.notice_pk=n.id
       LEFT JOIN notice_deadline d ON d.notice_pk=n.id
       LEFT JOIN notice_translations tr ON tr.notice_id=n.id AND tr.lang='zh'
       LEFT JOIN notice_translations tre ON tre.notice_id=n.id AND tre.lang='en'
      WHERE n.id IN (${chunk.map(() => "?").join(",")})`,
    chunk,
  );
  const [sideRows] = await pool.query(
    `SELECT notice_pk, source_url, file_name, content_type, status
       FROM notice_attachment_text
      WHERE notice_pk IN (${chunk.map(() => "?").join(",")})
        AND status IN ('listed','parsed','unsupported')`,
    chunk,
  );
  const attachmentMap = new Map<number, Array<Record<string, unknown>>>();
  for (const a of sideRows as RowDataPacket[]) {
    const id = Number(a.notice_pk);
    if (!attachmentMap.has(id)) attachmentMap.set(id, []);
    attachmentMap.get(id)!.push({
      url: a.source_url,
      name: a.file_name,
      type: a.content_type,
      status: a.status,
    });
  }

  const noticeIds = (rows as RowDataPacket[]).map((r) => String(r.notice_id ?? "")).filter(Boolean);
  const convertedIds = [...new Set((rows as RowDataPacket[]).map((r) => Number(r.converted_opp_id)).filter((n) => Number.isFinite(n) && n > 0))];
  const oppWhere: string[] = [];
  const oppParams: unknown[] = [];
  if (noticeIds.length > 0) {
    oppWhere.push(`source_notice_id IN (${noticeIds.map(() => "?").join(",")})`);
    oppParams.push(...noticeIds);
  }
  if (convertedIds.length > 0) {
    oppWhere.push(`id IN (${convertedIds.map(() => "?").join(",")})`);
    oppParams.push(...convertedIds);
  }
  const oppRows = oppWhere.length > 0
    ? (await pool.query(
      `SELECT id, source_notice_id, title, description_cn, industry, beneficiary_countries,
              supplier_conditions, eligibility, technical_hurdles, update_time
         FROM bid_opportunities
        WHERE ${oppWhere.join(" OR ")}
        ORDER BY id DESC`,
      oppParams,
    ))[0] as RowDataPacket[]
    : [];
  const oppMap = new Map<string, {
    title: string | null; industry: string | null; beneficiary: string | null;
    sc: string | null; eh: string | null; th: string | null;
  }>();
  const oppWmById = new Map<number, number>();
  const oppWmByNotice = new Map<string, number>();
  for (const o of oppRows) {
    const wm = toWatermark(o.update_time);
    const oppId = Number(o.id);
    if (Number.isFinite(oppId)) oppWmById.set(oppId, Math.max(oppWmById.get(oppId) ?? 0, wm));
    const key = String(o.source_notice_id ?? "");
    if (key) oppWmByNotice.set(key, Math.max(oppWmByNotice.get(key) ?? 0, wm));
    const entry = {
      title: String(o.title ?? "").trim() || null,
      // 商机表 industry 是运营/商机侧维护的 canonical 采购主题，比公告主表更可信（受影响 200+ 行）
      industry: normalizeIndustry(o.industry),
      beneficiary: String(o.beneficiary_countries ?? "").trim() || null,
      sc: String(o.supplier_conditions ?? "").trim() || null,
      eh: String(o.eligibility ?? "").trim() || null,
      th: String(o.technical_hurdles ?? "").trim() || null,
    };
    // 商机既可能按 source_notice_id 关联，也可能只按 bid_notices.converted_opp_id 关联；
    // 两种键都进 map，构建行时才能取到覆盖字段。
    const keys = [key, String(oppId)].filter(Boolean);
    for (const k of keys) {
      const prev = oppMap.get(k);
      if (!prev) oppMap.set(k, entry);
      else oppMap.set(k, {
        title: prev.title || entry.title,
        industry: prev.industry || entry.industry,
        beneficiary: prev.beneficiary || entry.beneficiary,
        sc: prev.sc || entry.sc,
        eh: prev.eh || entry.eh,
        th: prev.th || entry.th,
      });
    }
  }
  // 品目骨架路径：直接用宽表构建器的同一装载入口（落点表 notice_attribution_nodes），
  // 不再从宽表读——切读源后服务表自持这一列。
  const backboneMap = await loadBackboneMap(
    pool,
    (rows as RowDataPacket[])
      .map((r) => ({ pk: Number(r.id), noticeId: String(r.notice_id ?? "") }))
      .filter((s) => s.pk > 0 && s.noticeId),
  );
  return { rows: rows as RowDataPacket[], attachmentMap, oppMap, oppWmByNotice, oppWmById, backboneMap };
}

/**
 * 单行构建：返回与 PUBLIC_COLS 严格同序的参数数组；不可准入/无编号行返回 null（不入表）。
 */
export function buildPublicRow(
  r: RowDataPacket,
  ctx: PublicBuildContext,
  maps: Pick<PublicInputBatch, "attachmentMap" | "oppMap" | "oppWmByNotice" | "oppWmById"> & {
    /** 可选：缺省视为「无品目归属」，宽表退役前的旧调用方（脚本/单测）无需构造 */
    backboneMap?: Map<string, { backbone: string }>;
  },
): unknown[] | null {
  const noticeId = String(r.notice_id ?? "").trim().slice(0, 100);
  if (!noticeId) return null; // 对外查找键必须非空：无编号行不进服务表（--changed 选行已同口径排除）
  // 准入红线（与 PUBLIC_ADMIT_SQL 同口径）：平台未发布/待审/驳回、定向可见的行不进对外表；
  // 稳定过期（超清退余量）同口径排除——SQL 谓词与 JS 镜像必须同改（2026-11-13 构建时摘除）
  const admitted = (String(r.entry_source ?? "crawl") !== "platform"
    || ["published", "closed"].includes(String(r.rfq_status ?? "")))
    && String(r.visibility ?? "public") === "public"
    && !isStablyExpired(r.deadline_sec);
  if (!admitted) return null;
  const opp = maps.oppMap.get(noticeId) ?? maps.oppMap.get(String(r.converted_opp_id ?? ""));
  const body = r.body_text ? String(r.body_text) : null;
  // 正文只显示公告原文；商机 description 不覆盖。统一解码实体、去标签、压空白。
  const desc = cleanContentText(body || String(r.description ?? ""));
  const rawTitle = String(r.title ?? "").trim();
  const norm = normalizeTitle(rawTitle, desc);
  // 标题以商机表为准；商机标题也必须经过同一套实体/标签/空白清洗。
  const oppTitle = opp?.title ? normalizeTitle(String(opp.title), desc).clean : "";
  const title = String(oppTitle || r.title_clean || norm.clean || rawTitle).trim();
  const contentLevel = body
    ? String(r.content_level ?? (len(body) >= 300 ? "substantive" : "thin"))
    : len(desc) < 41 ? "empty"
      : echo(desc, rawTitle) && len(desc) - len(rawTitle) < 20 ? "echo"
        : len(desc) >= 300 ? "substantive" : "thin";

  // 买家/国家/机构类型：唯一口径 notice-normalize/notice-core（原始名 → 不做别名 canonical 化）
  const core = normalizeBuyerCountry(
    { agency: r.agency, agencyFull: r.agency_full, organization: r.organization, country: r.country },
    ctx.countrySnap,
  );
  const buyerName = core.buyerName?.slice(0, 500) ?? null;
  const countryCode = core.countryCode;
  const countryCodes = core.countryCodes;
  // 实体匹配：国家维精确 → 全局唯一回退；歧义/未命中一律不猜（保持原始名并进候选队列）
  const buyerEntity = buyerName
    ? resolveBuyerEntity(ctx.buyerIndex, buyerName, countryCode)
    : null;
  const buyerId = buyerEntity?.buyerId ?? null;
  const buyerCanonical = buyerEntity?.canonical?.slice(0, 500) ?? buyerName;
  const buyerNameCn = buyerCanonical
    ? (buyerEntity?.nameZh?.slice(0, 500) ?? null)
    : null;
  // [2026-10-31 机构类型维度退役] buyer_group 停写；2026-11-17 服务表与宽表列已物理删除
  // 裸 "Contract"（Mercell 等聚合源）只给一个母类型，按标题/正文细分 DPS/资格系统/框架协议；
  // 其余源沿用唯一归一逻辑，避免把 CONTRACT_NOTICE 的通用值误判。
  const rawNoticeType = String(r.notice_type ?? "").trim();
  const noticeType = (rawNoticeType.toLowerCase() === "contract"
    ? classifyBareContractNotice(rawTitle, desc)
    : normalizeNoticeType(rawNoticeType)
  ).slice(0, 20) || null;
  const platform = platformOf(ctx, r.url, r.agency, r.organization);
  const amount = normalizeAmount(r.estimated_value, { currencyHint: r.currency, countryCode, description: desc });
  if (Number(r.budget_confidential ?? 0) === 1) {
    // 预算保密：行照进服务表，金额整体置空，防数值经归一化后被对外还原
    amount.amount = null; amount.min = null; amount.max = null;
    amount.currency = null;
  }
  // DECIMAL(20,2) 上限；源值畸形/超长时整体置空，不能截断成假金额。
  // 上界写作 1e18（DECIMAL 最大 1e18-0.01，≥1e18 即存不下）：1e18 在 double 里精确可表，
  // 而 999999999999999999.99 这个字面量本身就会丢精度（no-loss-of-precision）。
  const MAX_AMOUNT = 1e18;
  if (amount.amount != null && (!Number.isFinite(Number(amount.amount)) || Math.abs(Number(amount.amount)) >= MAX_AMOUNT)) {
    amount.amount = null;
  }
  // 没有金额就不保留孤立币种；金额为空时币种必须为空
  if (amount.amount == null) {
    amount.currency = null;
  }
  // 源库 currency=CNY 多为占位值；金额有值但币种缺失时，按平台默认币种兜底。
  if (amount.amount != null && !amount.currency) {
    const inferred = inferPlatformCurrency(platform?.name);
    if (inferred) {
      amount.currency = inferred;
    }
  }
  const contacts = normalizeContacts(r.contacts, {
    contactPhone: r.contact_phone, contactEmail: r.contact_email, description: desc, countryCode,
  });
  const rawAttachments = (maps.attachmentMap.get(Number(r.id)) ?? []).length > 0
    ? maps.attachmentMap.get(Number(r.id))!
    : normalizeDocumentRows(r.documents, r.procurement_files);
  // 去掉“Download all documents”这类聚合入口；它是入口，不是招标文件。
  const attachments = dedupeDocuments(rawAttachments.filter((d) => {
    const name = String((d as Record<string, unknown>).name ?? (d as Record<string, unknown>).title ?? "").trim();
    const url = String((d as Record<string, unknown>).url ?? "");
    return !/^download all documents$/i.test(name) && !/downloadalldocuments/i.test(url);
  }));
  const attachmentUrls = new Set(attachments.map((d) => String(d.url ?? "").toLowerCase()));
  // 外链只留“非文件页面”；文件型外链迁入附件并计数，避免同一资源两边都有。
  const externalLinks = [];
  for (const d of normalizeDocumentRows(r.external_links)) {
    const url = String(d.url ?? "").trim();
    if (!url || attachmentUrls.has(url.toLowerCase())) continue;
    if (isFileUrl(url)) {
      attachments.push(d);
      attachmentUrls.add(url.toLowerCase());
    } else {
      externalLinks.push(d);
    }
  }
  const dstate = String(r.deadline_state ?? (Number(r.deadline_sec) > 0 ? "known" : "unknown"));
  // 只有 known 的截止时间对外有效：placeholder（哨兵/占位日期，如 2125-12-31、2050 年）、
  // typo_suspect（年份笔误）、unknown 一律落 NULL。注意不能用 `effective_ts ?? deadline_sec`
  // 兜底——分类器判定不可信时 effective_ts 就是 NULL，回退会把占位日期又写回去。
  const deadlineTs = dstate === "known" ? toEpoch(r.effective_ts ?? r.deadline_sec) : null;
  const publishedTs = toEpoch(r.published_date);
  const registration = normRegistration(r.registration_level);
  // 中文正文唯一来源：翻译旁表 description_tr（lang='zh'，构建 SELECT 已带出）。
  // 商机表的人工中文由 scripts/tools/opportunity-zh-sync.ts 搬进翻译表，
  // 构建不再回头读商机表 —— 两处读同一份数据只会造出第二个来源（2026-11-24 口径：
  // 翻译表是中文的唯一存放处，服务表的中文两列都从它来）。
  const contentZh = String(r.description_cn_tr ?? "").trim() || null;
  // 受援国按服务表原文归一：统一成标准国家名，去重，避免自由文本直接透出。
  // refs 含国家+区域（"国家, 区域" 合法形态两段都映射，如「莫桑比克, 西南印度洋」）；
  // 仅区域命中 → 区域名（与国家码 ZZ 口径一致）；两者皆无 → 原文回退（真缺表，巡检待补）。
  const beneficiaryRaw = String(r.beneficiary_countries ?? "").trim();
  const bRes = beneficiaryRaw ? resolveCountries(beneficiaryRaw, ctx.countrySnap) : null;
  const beneficiary = bRes && bRes.refs.length > 0
    ? [...new Set(bRes.refs.map((ref) => ref.zh || ref.canonical).filter(Boolean))].join(", ").slice(0, 500)
    : (beneficiaryRaw.slice(0, 500) || null);
  const titleCn = String(r.title_cn ?? "").trim().slice(0, 1000) || null;
  // 供应商条件/资格要求/技术门槛：商机侧字段原样带入（读取侧「服务表优先，空则回退商机表」，
  // 商机本就是唯一产出方——服务表落值后回退分支自然不再触发）。
  const supplierConditions = opp?.sc ?? null;
  const eligibility = opp?.eh ?? null;
  const technicalHurdles = opp?.th ?? null;
  // 分享卡摘要（中/英）：构建期生成，供 OG 卡片、分享文案、列表 teaser 共用；
  // 抽不出可用文本时落 NULL，读侧回退标题（share-summary.ts 同一函数）。
  const shareSummary = buildShareSummary({ description: desc, descriptionCn: contentZh });
  // 英文译文（宽表退役：Meili 英文检索字段改由服务表提供）
  const titleEn = String(r.title_en ?? "").trim().slice(0, 1000) || null;
  const descriptionEn = String(r.description_en ?? "").trim() || null;
  // 品目骨架路径：空串按 BB7 视为无归属，落 NULL（不写空串）
  const backbonePath = String(maps.backboneMap?.get(noticeId)?.backbone ?? "").trim() || null;

  return [
    r.id, noticeId, extractUrl(r.url), String(r.reference ?? "").slice(0, 255) || null,
    title.slice(0, 500), titleCn, desc, contentZh, contentLevel,
    normalizeIndustry(opp?.industry) ?? normalizeIndustry(r.industry),
    publishedTs, deadlineTs, dstate, r.deadline_type ?? null, r.deadline_timezone ?? null,
    String(r.timezone_source ?? "").trim().slice(0, 20) || null,
    countryCode, JSON.stringify(countryCodes), noticeType,
    platform?.name ?? null,
    buyerCanonical, buyerId, buyerNameCn,
    amount.amount, amount.currency,
    JSON.stringify(contacts.entries), JSON.stringify(attachments), JSON.stringify(externalLinks),
    registration, beneficiary,
    supplierConditions, eligibility, technicalHurdles,
    // 行水位 = 全部输入的 max（主表 + 商机 + 标题旁表），各侧选行分支才能收敛到「不再重选」。
    // 水位先过合法区间：主表 update_time 的 YYYYMMDDHHMMSS 脏值不能进对外 updated_at。
    Math.max(
      toWatermark(r.update_time),
      maps.oppWmByNotice.get(noticeId) ?? 0,
      Number(r.converted_opp_id) > 0 ? maps.oppWmById.get(Number(r.converted_opp_id)) ?? 0 : 0,
      toWatermark(r.title_updated_at),
    ) || Math.floor(Date.now() / 1000),
    Number(r.is_opportunity ?? 0) >= 1 ? 1 : 0,
    shareSummary.zh,
    shareSummary.en,
    titleEn,
    descriptionEn,
    backbonePath,
  ];
}

/**
 * 生成服务表列的「回滚 SQL」文本（仅供运维脚本导出，不在此执行）。
 *
 * N1 门禁要求 `notice_public` 的 INSERT/UPDATE/DELETE/TRUNCATE 只能出现在本模块；
 * 运维脚本的回滚 SQL 文本也属于写语句口径，因此统一在这里产出，脚本只负责落盘。
 *
 * @param column 仅允许合法列标识符（白名单校验，防注入）
 * @param byValue 旧值 → 该值对应的 notice_pk 列表
 */
export function buildPublicColumnRollbackSql(
  column: string,
  byValue: Map<string, number[]>,
): string {
  if (!/^[a-z][a-z0-9_]*$/.test(column)) throw new Error(`invalid column: ${column}`);
  return [...byValue.entries()]
    .map(
      ([value, ids]) =>
        `-- ${ids.length} 行\nUPDATE notice_public SET ${column}='${value.replace(/'/g, "''")}'\n  WHERE notice_pk IN (${ids.join(",")});\n`,
    )
    .join("\n");
}

/** 批量 upsert 服务表（唯一写入路径；ODKU 全列覆盖，notice_pk 除外） */
export async function upsertPublicRows(pool: Pool, params: unknown[][]): Promise<number> {
  if (params.length === 0) return 0;
  const ROW = `(${PUBLIC_COLS.map(() => "?").join(",")})`;
  await pool.query(
    `INSERT INTO notice_public (${PUBLIC_COLS.join(",")}) VALUES ${params.map(() => ROW).join(",")}
     ON DUPLICATE KEY UPDATE ${PUBLIC_COLS.filter((c) => c !== "notice_pk").map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(",")}`,
    params.flat(),
  );
  return params.length;
}

/**
 * 差异选行：只重算「服务表缺行」或「任一输入（主表 / 商机 / 标题旁表）比服务表 updated_at 新」的行。
 * 不等式判据一次性抹掉时间窗口选行的两类洞（update_time 很老但确实变了的行 / update_time
 * IS NULL 且从未进过服务表的行）。
 */
export async function selectChangedPublicIds(pool: Pool): Promise<number[]> {
  const oppStaleSql = `
      (SELECT n.id
         FROM bid_opportunities o JOIN bid_notices n ON n.converted_opp_id = o.id
         JOIN notice_public p ON p.notice_pk = n.id
        WHERE o.update_time IS NOT NULL AND UNIX_TIMESTAMP(o.update_time) > IFNULL(p.updated_at, 0)
          AND ${PUBLIC_ADMIT_SQL})
      UNION
      (SELECT n.id
         FROM bid_opportunities o JOIN bid_notices n ON n.notice_id = o.source_notice_id
         JOIN notice_public p ON p.notice_pk = n.id
        WHERE o.update_time IS NOT NULL AND UNIX_TIMESTAMP(o.update_time) > IFNULL(p.updated_at, 0)
          AND ${PUBLIC_ADMIT_SQL})`;
  // 标题旁表分支（2026-10-27）：标题管道回写 title_clean 不 touch 主表 update_time，
  // 行水位已含 title_updated_at（见 buildPublicRow），本分支才能收敛到「不再重选」。
  const titleStaleSql = `
      (SELECT n.id
         FROM notice_title t JOIN bid_notices n ON n.id = t.notice_pk
         JOIN notice_public p ON p.notice_pk = n.id
        WHERE t.updated_at IS NOT NULL AND UNIX_TIMESTAMP(t.updated_at) > IFNULL(p.updated_at, 0)
          AND ${PUBLIC_ADMIT_SQL})`;
  const [rows] = await pool.query(`
      SELECT id FROM (
        SELECT n.id FROM bid_notices n
        LEFT JOIN notice_public p ON p.notice_pk = n.id
         WHERE (p.notice_pk IS NULL AND n.notice_id IS NOT NULL AND n.notice_id <> '' AND ${PUBLIC_ADMIT_SQL})
            -- 「已存在行的时间戳变新」分支必须带 p.notice_pk IS NOT NULL（2026-11-17 事故）：
            -- 服务表缺行时 p.* 全为 NULL，IFNULL(p.updated_at,0)=0 ⇒ 任何 update_time>0 的行都成立，
            -- 等于绕过 PUBLIC_ADMIT_SQL 把全库（含过期 30 天以上、本就不准入的行）都选进来。
            -- 实测：选行 489,832，构建侧只接受 92 条，每轮空转 2.2h，新抓取永远等不到服务表。
            -- 水位必须是合法 epoch 秒：主表 update_time 的 YYYYMMDDHHMMSS 脏值（实测 83 行）
            -- 恒大于 updated_at，会成为每轮都命中的「永久选行」，把重建变成空转。
            OR (p.notice_pk IS NOT NULL AND n.update_time IS NOT NULL
                AND n.update_time BETWEEN 946684800 AND 4102444800
                AND n.update_time > IFNULL(p.updated_at, 0))
        UNION ${oppStaleSql}
        UNION ${titleStaleSql}
      ) u ORDER BY id`);
  return (rows as RowDataPacket[]).map((r) => Number(r.id));
}

/** ghost 选行：主表已不存在 / 无外部编号 / 已不再准入；删除由调用方执行（CLI 受 --apply 门控） */
export async function selectPublicGhostIds(pool: Pool): Promise<number[]> {
  const [ghosts] = await pool.query(`
      SELECT p.notice_pk AS id FROM notice_public p
      LEFT JOIN bid_notices n ON n.id = p.notice_pk
       WHERE n.id IS NULL
      UNION
      SELECT notice_pk AS id FROM notice_public WHERE notice_id = ''
      UNION
      SELECT p.notice_pk AS id FROM notice_public p
       JOIN bid_notices n ON n.id = p.notice_pk
      WHERE NOT (${PUBLIC_ADMIT_SQL})`) as [RowDataPacket[], unknown];
  return [...new Set(ghosts.map((r) => Number(r.id)).filter((id) => Number.isFinite(id)))];
}

export async function deletePublicRows(pool: Pool, ids: number[]): Promise<number> {
  let pruned = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const res = await pool.query(
      `DELETE FROM notice_public WHERE notice_pk IN (${chunk.map(() => "?").join(",")})`, chunk,
    );
    pruned += (res[0] as unknown as { affectedRows: number }).affectedRows;
  }
  return pruned;
}


/** 展示缓存写回：仅 build.ts 可写 notice_public（N1 红线）。
 *  列表页只读 title_cn；详情命中旧译文缓存/异步标题翻译时回写一次，避免列表仍显示原文。 */
export async function syncNoticeTitleCn(pool: Pool, noticePk: number, titleCn: string): Promise<void> {
  const value = String(titleCn ?? "").trim();
  if (!value) return;
  await pool.execute("UPDATE notice_public SET title_cn = LEFT(?, 1000) WHERE notice_pk = ?", [value, noticePk]);
}

/**
 * 英文译文 + 品目骨架路径回填（宽表退役 Phase 1）。
 *
 * 服务表唯一写入者仍是本模块（N1）；脚本只做数据搬运与调用。
 * - 英文：`notice_translations(lang='en')` → `title_en` / `description_en`（只补空，不覆盖）
 * - 骨架：`notice_attribution_nodes`（经 `loadBackboneMap`，与宽表构建同一入口）→ `backbone_path`
 *
 * 幂等，可反复跑；切换期可当定时桥接作业（新代码接管写路径后即可停）。
 */
export async function backfillPublicEnAndBackbone(
  pool: Pool,
  opts: { recentHours?: number } = {},
): Promise<{ enWritten: number; backboneWritten: number; scanned: number }> {
  const recentHours = Math.max(0, Math.floor(opts.recentHours ?? 0));
  const recentWhere = recentHours > 0 ? `AND p.updated_at >= UNIX_TIMESTAMP(NOW()) - ${recentHours * 3600}` : "";
  const CHUNK = 2000;

  // ① 英文译文
  let enWritten = 0;
  let cursor = 0;
  for (;;) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.notice_pk FROM notice_public p
         JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'en'
        WHERE p.notice_pk > ?
          AND t.title_tr IS NOT NULL AND t.title_tr <> ''
          AND ((p.title_en IS NULL OR p.title_en = '')
            OR (p.description_en IS NULL AND t.description_tr IS NOT NULL AND t.description_tr <> ''))
          ${recentWhere}
        ORDER BY p.notice_pk LIMIT ${CHUNK}`,
      [cursor],
    );
    if (rows.length === 0) break;
    const ids = rows.map((r) => Number(r.notice_pk));
    const [res] = await pool.query(
      `UPDATE notice_public p
         JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'en'
          SET p.title_en = IF(p.title_en IS NULL OR p.title_en = '', LEFT(t.title_tr, 1000), p.title_en),
              p.description_en = IF(p.description_en IS NULL AND t.description_tr IS NOT NULL AND t.description_tr <> '',
                                    t.description_tr, p.description_en)
        WHERE p.notice_pk IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    enWritten += Number((res as { affectedRows?: number }).affectedRows ?? 0);
    cursor = ids[ids.length - 1];
  }

  // ② 品目骨架路径
  let backboneWritten = 0;
  let scanned = 0;
  await pool.query(`CREATE TEMPORARY TABLE IF NOT EXISTS tmp_np_backbone (
      notice_pk int NOT NULL PRIMARY KEY, backbone mediumtext
    ) ENGINE=InnoDB`);
  try {
    let bbCursor = 0;
    for (;;) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.notice_pk, p.notice_id FROM notice_public p
          WHERE p.notice_pk > ? ${recentWhere} ORDER BY p.notice_pk LIMIT ${CHUNK}`,
        [bbCursor],
      );
      if (rows.length === 0) break;
      const map = await loadBackboneMap(
        pool,
        rows.map((r) => ({ pk: Number(r.notice_pk), noticeId: String(r.notice_id ?? "") })),
      );
      const values = rows
        .map((r) => ({ pk: Number(r.notice_pk), bb: map.get(String(r.notice_id ?? ""))?.backbone ?? "" }))
        .filter((v) => v.bb);
      if (values.length > 0) {
        await pool.query(
          `INSERT INTO tmp_np_backbone (notice_pk, backbone) VALUES ${values.map(() => "(?, ?)").join(",")}
           ON DUPLICATE KEY UPDATE backbone = VALUES(backbone)`,
          values.flatMap((v) => [v.pk, v.bb]),
        );
      }
      scanned += rows.length;
      bbCursor = Number(rows[rows.length - 1].notice_pk);
    }
    const [res] = await pool.query(
      `UPDATE notice_public p JOIN tmp_np_backbone t ON t.notice_pk = p.notice_pk
          SET p.backbone_path = t.backbone
        WHERE p.backbone_path IS NULL OR p.backbone_path <> t.backbone`,
    );
    backboneWritten = Number((res as { affectedRows?: number }).affectedRows ?? 0);
  } finally {
    await pool.query("DROP TEMPORARY TABLE IF EXISTS tmp_np_backbone");
  }

  return { enWritten, backboneWritten, scanned };
}

/**
 * 中文搬运脚本回填：翻译表 → 服务表 title_cn / description_cn。
 * 服务表唯一写入者仍是本模块（N1）；脚本只负责数据搬运与调用。
 */
export async function backfillPublicChineseFromTranslations(pool: Pool, noticePks: number[]): Promise<number> {
  if (noticePks.length === 0) return 0;
  const [res] = await pool.query(
    `UPDATE notice_public p
       JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'zh'
        SET p.title_cn = IF(t.title_tr IS NULL OR t.title_tr = '', p.title_cn, LEFT(t.title_tr, 1000)),
            p.description_cn = IF(t.description_tr IS NULL OR t.description_tr = '', p.description_cn, t.description_tr)
      WHERE p.notice_pk IN (?)
        AND ((t.title_tr IS NOT NULL AND t.title_tr <> ''
              AND (p.title_cn IS NULL OR p.title_cn <> LEFT(t.title_tr, 1000)))
          OR (t.description_tr IS NOT NULL AND t.description_tr <> ''
              AND (p.description_cn IS NULL OR p.description_cn <> t.description_tr)))`,
    [noticePks],
  );
  return (res as ResultSetHeader).affectedRows;
}

