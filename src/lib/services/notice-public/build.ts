/**
 * 服务表 notice_public 构建核心（唯一写入者代码路径）。
 *
 * 2026-10-27 管道翻转（主表 → ①服务表 → ②宽表 → Meili）：服务表从"ops 本机脚本第三棒"
 * 升级为应用内归一层，构建逻辑从当日的本机一次性 ops 脚本（gitignore、仅存本机、
 * standalone 部署缺失即静默跳过；后随翻转落地删除）抽入本模块——仓库内可审、生产可跑、
 * 换机不丢。门禁 check-notice-public-ssot 的 N1/N2 以本文件为唯一基准。
 *
 * 归一化口径：买家/国家/机构类型走 notice-normalize/notice-core（与宽表投影同源）；
 * 金额/联系方式/标题/正文分级在本模块内完成，产出即对外事实。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeTitle, cleanContentText } from "../notice-content/title";
import { normalizeAmount } from "../notice-normalize/amount";
import { normalizeContacts } from "../notice-normalize/phone";
import { resolveCountries } from "../country/resolve";
import { normalizeBuyerCountry } from "../notice-normalize/notice-core";
import { normalizeIndustry } from "../notice-normalize/industry";
import { loadAgencyAliasSnapshot, normalizeAliasKey } from "../agency/alias-store";
import type { AgencyAliasSnapshot } from "../agency/alias-store";
import { loadCountryAliasSnapshot } from "../country/alias-store";
import type { CountryAliasSnapshot } from "../country/alias-store";
import { loadAgencyTypeRules } from "../agency/type-store";
import { normalizeNoticeType } from "../../utils/notice-type";
import { normalizeDocumentRows } from "../../utils/normalize";

// ── 准入红线（2026-10-22 用户拍板，选行/构建/清理三处共用同一谓词）──────────────
// 服务表是对外表：平台自录 RFQ 仅「发布过」（published/closed）可进——草稿/待审/驳回
// 从未公开，rfq_status 为 NULL 的平台行视为未发布一并排除；定向可见（visibility<>public）
// 不进；爬虫/API 来源（entry_source<>'platform'）不受 rfq_status 约束（本就是公开抓取）。
export const PUBLIC_ADMIT_SQL = `(n.entry_source <> 'platform' OR n.rfq_status IN ('published','closed'))
   AND IFNULL(n.visibility, 'public') = 'public'`;

/** 服务表列清单（= baseline.sql 的 notice_public 列集，门禁 N2 逐列比对） */
export const PUBLIC_COLS = [
  "notice_pk", "notice_id", "source_url", "reference",
  "title", "title_cn", "description", "description_cn", "content_level", "industry",
  "published_ts", "deadline_ts", "deadline_state", "deadline_type", "deadline_timezone",
  "country_code", "country_codes", "notice_type_code",
  "platform_name",
  "buyer_name", "buyer_id", "buyer_name_cn", "buyer_group",
  "estimated_value", "currency_code", "currency_source",
  "contacts", "attachments", "external_links",
  "difficulty", "registration_level", "beneficiary_countries",
  "updated_at", "is_opportunity",
] as const;

interface PlatformEntry { code: string; name: string }

/** 构建上下文：别名/平台快照一次性装载，批间复用 */
export interface PublicBuildContext {
  agencyAliases: Map<string, string>;
  countrySnap: CountryAliasSnapshot;
  platformByHost: Map<string, PlatformEntry>;
  platformByAlias: Map<string, PlatformEntry>;
  /** 国家 + 买家名 → 买家实体（服务表落 buyer_id，展示用实体规范名） */
  buyerEntities: Map<string, { buyerId: number; canonical: string; nameZh: string | null; group: string | null }>;
}

export async function loadPublicBuildContext(pool: Pool): Promise<PublicBuildContext> {
  await loadAgencyTypeRules(pool, true);
  const agencySnap: AgencyAliasSnapshot = await loadAgencyAliasSnapshot(pool);
  const countrySnap = await loadCountryAliasSnapshot(pool);
  const agencyAliases: Map<string, string> = new Map(
    Array.from(agencySnap.byAlias, ([k, e]) => [k, e.canonical] as const),
  );
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
      const key = String(a ?? "").trim().toUpperCase();
      if (key) platformByAlias.set(key, entry);
    }
  }
  const buyerEntities = new Map<string, { buyerId: number; canonical: string; nameZh: string | null; group: string | null }>();
  const [baRows] = await pool.query(
    `SELECT a.alias, a.country_code, b.buyer_id, b.canonical_name, b.name_zh, b.buyer_group
       FROM buyer_alias a JOIN buyer b ON b.buyer_id = a.buyer_id`,
  );
  for (const r of baRows as RowDataPacket[]) {
    const key = `${String(r.country_code ?? "")}|${normalizeAliasKey(r.alias)}`;
    buyerEntities.set(key, {
      buyerId: Number(r.buyer_id),
      canonical: String(r.canonical_name ?? r.alias ?? ""),
      nameZh: r.name_zh ? String(r.name_zh) : null,
      group: r.buyer_group ? String(r.buyer_group) : null,
    });
  }
  return { agencyAliases, countrySnap, platformByHost, platformByAlias, buyerEntities };
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
    const key = normalizeAliasKey(raw);
    if (key && ctx.platformByAlias.has(key)) return ctx.platformByAlias.get(key)!;
  }
  return null;
}

export function toEpoch(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d{10,13}$/.test(String(v))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    const ms = Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0));
    return Math.floor(ms / 1000);
  }
  const mon: Record<string, number> = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  const dmy = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})/.exec(s);
  if (dmy) {
    const m = mon[dmy[2].toLowerCase()];
    if (m != null) return Math.floor(Date.UTC(+dmy[3], m, +dmy[1]) / 1000);
  }
  // 20/07/2026 或 07/20/2026：只有一方 >12 时才可无歧义解析
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    if (a > 12 || b > 12) {
      const day = a > 12 ? a : b;
      const month = a > 12 ? b : a;
      return Math.floor(Date.UTC(+slash[3], month - 1, day) / 1000);
    }
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function normDifficulty(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
  if (!s) return null;
  if (/低|low/.test(s)) return "low";
  if (/中等|medium/.test(s)) return "medium";
  if (/较高|较髙|高|high/.test(s)) return "high";
  return "unknown";
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
  oppMap: Map<string, { title: string | null; cn: string | null; beneficiary: string | null }>;
  /** 商机侧两组水位映射（updated_at 取输入 max 的依据，保证商机侧选行收敛） */
  oppWmByNotice: Map<string, number>;
  oppWmById: Map<number, number>;
}

export async function fetchPublicInputRows(pool: Pool, chunk: number[]): Promise<PublicInputBatch> {
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id, n.reference, n.url, n.title, n.description, n.published_date,
            n.deadline_sec, n.country, n.notice_type, n.agency, n.agency_full, n.organization,
            n.contacts, n.contact_phone, n.contact_email, n.currency, n.estimated_value,
            n.documents, n.procurement_files, n.external_links, n.difficulty, n.registration_level,
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
            d.deadline_state, d.deadline_type, d.deadline_timezone, d.effective_ts, d.confidence,
            tr.title_tr AS title_cn
       FROM bid_notices n
       LEFT JOIN notice_title t ON t.notice_pk=n.id
       LEFT JOIN notice_body b ON b.notice_pk=n.id
       LEFT JOIN notice_deadline d ON d.notice_pk=n.id
       LEFT JOIN notice_translations tr ON tr.notice_id=n.id AND tr.lang='zh'
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
      `SELECT id, source_notice_id, title, description_cn, beneficiary_countries, update_time
         FROM bid_opportunities
        WHERE ${oppWhere.join(" OR ")}
        ORDER BY id DESC`,
      oppParams,
    ))[0] as RowDataPacket[]
    : [];
  const oppMap = new Map<string, { title: string | null; cn: string | null; beneficiary: string | null }>();
  const oppWmById = new Map<number, number>();
  const oppWmByNotice = new Map<string, number>();
  for (const o of oppRows) {
    const wm = toEpoch(o.update_time) ?? 0;
    const oppId = Number(o.id);
    if (Number.isFinite(oppId)) oppWmById.set(oppId, Math.max(oppWmById.get(oppId) ?? 0, wm));
    const key = String(o.source_notice_id ?? "");
    if (key) oppWmByNotice.set(key, Math.max(oppWmByNotice.get(key) ?? 0, wm));
    const entry = {
      title: String(o.title ?? "").trim() || null,
      cn: String(o.description_cn ?? "").trim() || null,
      beneficiary: String(o.beneficiary_countries ?? "").trim() || null,
    };
    // 商机既可能按 source_notice_id 关联，也可能只按 bid_notices.converted_opp_id 关联；
    // 两种键都进 map，构建行时才能取到覆盖字段。
    const keys = [key, String(oppId)].filter(Boolean);
    for (const k of keys) {
      const prev = oppMap.get(k);
      if (!prev) oppMap.set(k, entry);
      else oppMap.set(k, {
        title: prev.title || entry.title,
        cn: prev.cn || entry.cn,
        beneficiary: prev.beneficiary || entry.beneficiary,
      });
    }
  }
  return { rows: rows as RowDataPacket[], attachmentMap, oppMap, oppWmByNotice, oppWmById };
}

/**
 * 单行构建：返回与 PUBLIC_COLS 严格同序的参数数组；不可准入/无编号行返回 null（不入表）。
 */
export function buildPublicRow(
  r: RowDataPacket,
  ctx: PublicBuildContext,
  maps: Pick<PublicInputBatch, "attachmentMap" | "oppMap" | "oppWmByNotice" | "oppWmById">,
): unknown[] | null {
  const noticeId = String(r.notice_id ?? "").trim().slice(0, 100);
  if (!noticeId) return null; // 对外查找键必须非空：无编号行不进服务表（--changed 选行已同口径排除）
  // 准入红线（与 PUBLIC_ADMIT_SQL 同口径）：平台未发布/待审/驳回、定向可见的行不进对外表
  const admitted = (String(r.entry_source ?? "crawl") !== "platform"
    || ["published", "closed"].includes(String(r.rfq_status ?? "")))
    && String(r.visibility ?? "public") === "public";
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

  // 买家/国家/机构类型：唯一口径 notice-normalize/notice-core
  const core = normalizeBuyerCountry(
    { agency: r.agency, agencyFull: r.agency_full, organization: r.organization, country: r.country },
    ctx.agencyAliases, ctx.countrySnap,
  );
  const buyerName = core.buyerName?.slice(0, 500) ?? null;
  const buyerGroup = core.buyerGroup?.slice(0, 100) ?? null;
  const countryCode = core.countryCode;
  const countryCodes = core.countryCodes;
  const buyerEntity = buyerName
    ? ctx.buyerEntities.get(`${countryCode ?? ""}|${normalizeAliasKey(buyerName)}`)
    : undefined;
  const buyerId = buyerEntity?.buyerId ?? null;
  const buyerCanonical = buyerEntity?.canonical?.slice(0, 500) ?? buyerName;
  const buyerGroupFinal = (buyerEntity?.group?.slice(0, 100) ?? buyerGroup) || null;
  const buyerNameCn = buyerCanonical
    ? (buyerEntity?.nameZh?.slice(0, 500) ?? null)
    : null;
  // 英文 canonical 名（core.countryName）只在上游 classifyBuyerGroup 内部消费，服务表不再落列
  const noticeType = normalizeNoticeType(String(r.notice_type ?? "")).slice(0, 20) || null;
  const platform = platformOf(ctx, r.url, r.agency, r.organization);
  const amount = normalizeAmount(r.estimated_value, { currencyHint: r.currency, countryCode, description: desc });
  if (Number(r.budget_confidential ?? 0) === 1) {
    // 预算保密：行照进服务表，金额整体置空，防数值经归一化后被对外还原
    amount.amount = null; amount.min = null; amount.max = null;
    amount.currency = null; amount.currencySource = "none";
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
    amount.currencySource = "none";
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
  const rawTs = r.effective_ts ?? r.deadline_sec;
  const deadlineTs = dstate === "typo_suspect" || dstate === "unknown" ? null : toEpoch(rawTs);
  const publishedTs = toEpoch(r.published_date);
  const difficulty = normDifficulty(r.difficulty);
  const registration = normRegistration(r.registration_level);
  // 中文正文：商机表有中文描述就直接覆盖服务表；无则保留服务表已有中文内容。
  const contentZh = opp?.cn ? cleanContentText(opp.cn) : null;
  // 受援国按服务表原文归一：统一成标准国家名，去重，避免自由文本直接透出。
  // refs 含国家+区域（"国家, 区域" 合法形态两段都映射，如「莫桑比克, 西南印度洋」）；
  // 仅区域命中 → 区域名（与国家码 ZZ 口径一致）；两者皆无 → 原文回退（真缺表，巡检待补）。
  const beneficiaryRaw = String(r.beneficiary_countries ?? "").trim();
  const bRes = beneficiaryRaw ? resolveCountries(beneficiaryRaw, ctx.countrySnap) : null;
  const beneficiary = bRes && bRes.refs.length > 0
    ? [...new Set(bRes.refs.map((ref) => ref.zh || ref.canonical).filter(Boolean))].join(", ").slice(0, 500)
    : (beneficiaryRaw.slice(0, 500) || null);
  const titleCn = String(r.title_cn ?? "").trim().slice(0, 1000) || null;

  return [
    r.id, noticeId, extractUrl(r.url), String(r.reference ?? "").slice(0, 255) || null,
    title.slice(0, 500), titleCn, desc, contentZh, contentLevel,
    normalizeIndustry(r.industry),
    publishedTs, deadlineTs, dstate, r.deadline_type ?? null, r.deadline_timezone ?? null,
    countryCode, JSON.stringify(countryCodes), noticeType,
    platform?.name ?? null,
    buyerCanonical, buyerId, buyerNameCn, buyerGroupFinal,
    amount.amount, amount.currency, amount.currencySource,
    JSON.stringify(contacts.entries), JSON.stringify(attachments), JSON.stringify(externalLinks),
    difficulty, registration, beneficiary,
    // 行水位 = 全部输入的 max（主表 + 商机 + 标题旁表），各侧选行分支才能收敛到「不再重选」
    Math.max(
      toEpoch(r.update_time) ?? 0,
      maps.oppWmByNotice.get(noticeId) ?? 0,
      Number(r.converted_opp_id) > 0 ? maps.oppWmById.get(Number(r.converted_opp_id)) ?? 0 : 0,
      toEpoch(r.title_updated_at) ?? 0,
    ) || Math.floor(Date.now() / 1000),
    Number(r.is_opportunity ?? 0) >= 1 ? 1 : 0,
  ];
}

/** 把未命中买家的原始来源名登记到 buyer_candidate（不自动创建买家实体）。 */
export async function syncBuyerCandidates(pool: Pool): Promise<number> {
  const [res] = await pool.query(
    `INSERT INTO buyer_candidate
       (candidate_key, country_code, raw_name, normalized_name, occurrence_count)
     SELECT SHA2(CONCAT(COALESCE(x.country_code, ''), '|', x.raw_name), 256),
            x.country_code,
            LEFT(x.raw_name, 500),
            LEFT(LOWER(TRIM(x.raw_name)), 500),
            COUNT(*)
       FROM (
         SELECT p.country_code, TRIM(n.agency_full) AS raw_name
           FROM notice_public p JOIN bid_notices n ON n.id = p.notice_pk
          WHERE p.buyer_id IS NULL AND n.agency_full IS NOT NULL AND TRIM(n.agency_full) <> ''
         UNION ALL
         SELECT p.country_code, TRIM(n.organization) AS raw_name
           FROM notice_public p JOIN bid_notices n ON n.id = p.notice_pk
          WHERE p.buyer_id IS NULL AND n.organization IS NOT NULL AND TRIM(n.organization) <> ''
       ) x
      WHERE x.raw_name NOT REGEXP '^[a-z]{2,}_[a-z0-9_]+$'
        AND NOT EXISTS (
          SELECT 1 FROM buyer_alias a
           WHERE a.alias_key = SHA2(CONCAT(COALESCE(x.country_code, ''), '|', x.raw_name), 256)
        )
      GROUP BY x.country_code, x.raw_name
     ON DUPLICATE KEY UPDATE occurrence_count = occurrence_count + VALUES(occurrence_count),
       raw_name = VALUES(raw_name)`,
  );
  return Number((res as { affectedRows?: number }).affectedRows ?? 0);
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
            OR (n.update_time IS NOT NULL AND n.update_time > IFNULL(p.updated_at, 0))
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
