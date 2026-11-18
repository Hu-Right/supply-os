/**
 * 真实热门搜索 — 纯逻辑核心（零 DB / 零副作用，可单测）
 *
 * @module server/services/search-analytics/hot-search-core
 * @description 首页「热门搜索」的数据口径全部收敛在这里，编排层（hot-search.ts）只负责
 *              取数与缓存，不得在 SQL / 路由里另算一份：
 *
 *              1) 归一化：全角→半角、去首尾空白、压缩空白、小写、去高级语法符号；
 *                 PII（邮箱/手机号/身份证）与纯符号/超短词直接丢弃，不进热榜；
 *              2) 防刷：以「去重访客」为主、单访客单词次数封顶 3；
 *              3) 门槛：访客数 ≥3、搜索次数 ≥5、有结果率 ≥50%，不足整体回退数据覆盖榜；
 *              4) 热度分：10 × 访客数 + min(次数, 3 × 访客数)。
 *
 *              口径为什么这样定：2026-11-18 实测 user_search_log 全表 1,412 行 / 46 个用户，
 *              单个账号占 51%，若按原始次数排名会把「一个人反复搜的测试词」展示成全站热门。
 *
 *              隐私口径：匿名访客只参与 visitorHash（sha256(日盐|IP|UA)），本模块不接触
 *              原始 IP 的存储；哈希按「北京自然日」轮换，跨日不可关联。
 */
import { createHash } from "node:crypto";

/** 热度/阈值默认值（可被调用方覆盖；写进一个常量便于单测与调参对比） */
export const HOT_SEARCH_DEFAULTS = {
  /** 单访客对同一词一个窗口内最多计 3 次（防刷） */
  perVisitorCap: 3,
  /** 入榜门槛：去重访客数（冷启动期取 2，避免榜单长期为空；数据量起来后可上调） */
  minVisitors: 2,
  /** 入榜门槛：计入封顶后的搜索次数 */
  minSearches: 3,
  /** 入榜门槛：有结果占比（命中率） */
  minHitRate: 0.5,
  /** 返回条数 */
  limit: 8,
  /** 展示词长度范围（字符数，按码点计） */
  minTermLen: 2,
  maxTermLen: 30,
  /** 整体门槛：窗口内有效搜索总量 / 合格词数量（低于此值说明样本还不足以代表「大家」） */
  minTotalSearches: 50,
  minQualifiedTerms: 2,
} as const;

export type HotSearchMode = "hot" | "fallback";

/** 访客维度聚合行（SQL 按「词 × 访客」分组后逐行喂进来） */
export interface HotSearchVisitorRow {
  /** 归一化后的检索词（聚合键） */
  term: string;
  /** 展示用原文（同词多条时取出现最多的一个） */
  label: string | null;
  /** 访客唯一键：匿名=visitor_hash，登录用户=`u:<id>` */
  visitorKey: string;
  /** 该访客该词的搜索次数（未封顶） */
  searches: number;
  /** 该访客该词中「有结果」的次数 */
  hits: number;
}

/** 聚合后的热词（内部结构，API 只暴露 term/label/href） */
export interface HotSearchTerm {
  term: string;
  label: string;
  visitors: number;
  searches: number;
  hitRate: number;
  score: number;
}

export interface HotSearchOptions {
  perVisitorCap?: number;
  minVisitors?: number;
  minSearches?: number;
  minHitRate?: number;
  limit?: number;
  minTermLen?: number;
  maxTermLen?: number;
}

/** 全角 ASCII 区（！..～）+ 全角空格 → 半角；中文标点原样保留（后续由去符号逻辑处理） */
function toHalfWidth(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}

/** PII 模式：邮箱 / 中国大陆手机号 / 身份证号（命中即丢弃，不落热榜也不落 q_norm） */
const PII_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /1[3-9]\d{9}/,
  /\d{17}[\dXx]/,
];

/** 至少含一个文字/数字（纯符号、纯空白无检索价值） */
const HAS_MEANINGFUL_CHAR = /[A-Za-z0-9\u3400-\u9fff]/;

/** UUID 形态（用户误粘内部 id 搜索时不应成为热门词） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 是否像公告/采购编号一类的「参考码」而不是业务检索词：
 * UUID，或「无中文且数字 ≥4」的串（如 TPO000ETT26000031 / 00087-2026-0165 / DA-1699253）。
 * 这类词即使被搜索多次也不该出现在首页热门里（它是查具体公告，不是选品类）。
 */
export function isLikelyReferenceCode(term: string): boolean {
  const t = String(term ?? "").trim();
  if (!t) return true;
  if (UUID_RE.test(t)) return true;
  if (/[\u3400-\u9fff]/.test(t)) return false; // 含中文的按业务词处理
  const digits = (t.match(/\d/g) ?? []).length;
  return digits >= 4;
}

/**
 * 检索词归一化（写入日志 q_norm 与热榜聚合共用同一口径）。
 * @returns 归一后的词；不可用（空/纯符号/PII/超长）返回 null
 */
export function normalizeSearchTerm(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let s = toHalfWidth(String(raw));
  // 高级语法符号：去掉引号与前置 +/-（不做词项拆分，保持用户原意）
  s = s.replace(/["'“”‘’]/g, " ").replace(/(^|\s)[-+]+/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  if (s.length === 0) return null;
  if (PII_PATTERNS.some((re) => re.test(s))) return null;
  if (!HAS_MEANINGFUL_CHAR.test(s)) return null;
  // 与列宽对齐（q_norm varchar(120)）：超长检索词截断后再判空
  const trimmed = Array.from(s).slice(0, 120).join("").trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** bot/脚本 UA 判定：空 UA 也视为脚本（真实浏览器必带 UA） */
const BOT_UA_RE =
  /bot|crawler|spider|scrapy|python-requests|python-httpx|curl|wget|headless|phantomjs|selenium|playwright|puppeteer|httpclient|go-http-client|postman|insomnia|benchmark|monitor/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").trim();
  if (ua.length === 0) return true;
  return BOT_UA_RE.test(ua);
}

/** 北京自然日键（哈希轮换粒度；不落库原始时间） */
export function beijingDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 匿名访客哈希：sha256(盐|北京日|IP|UA)。
 * 不存原始 IP；跨日不可关联；无 UA 的调用方应已被 isBotUserAgent 拦掉。
 */
export function visitorHash(ip: string, userAgent: string, salt: string, now: Date = new Date()): string {
  return createHash("sha256")
    .update(`${salt}|${beijingDayKey(now)}|${String(ip ?? "")}|${String(userAgent ?? "")}`)
    .digest("hex");
}

/**
 * 按访客聚合行计算热词榜。
 * 算法：每个「词 × 访客」的搜索次数先按 perVisitorCap 封顶（防单用户刷榜），
 * 再按词汇总访客数/次数/命中率，过门槛后按热度分排序。
 */
export function computeHotTerms(
  rows: HotSearchVisitorRow[],
  opts: HotSearchOptions = {},
): HotSearchTerm[] {
  const o = { ...HOT_SEARCH_DEFAULTS, ...opts };
  const byTerm = new Map<string, { visitors: Map<string, { searches: number; hits: number }>; labels: Map<string, number> }>();

  for (const row of rows) {
    const term = typeof row.term === "string" ? row.term.trim() : "";
    if (!term) continue;
    const visitorKey = String(row.visitorKey ?? "").trim();
    if (!visitorKey) continue;
    const searches = Number.isFinite(row.searches) ? Math.max(0, Math.floor(row.searches)) : 0;
    const hits = Number.isFinite(row.hits) ? Math.max(0, Math.floor(row.hits)) : 0;
    if (searches <= 0) continue;

    let entry = byTerm.get(term);
    if (!entry) {
      entry = { visitors: new Map(), labels: new Map() };
      byTerm.set(term, entry);
    }
    const prev = entry.visitors.get(visitorKey);
    entry.visitors.set(visitorKey, {
      searches: (prev?.searches ?? 0) + searches,
      hits: (prev?.hits ?? 0) + hits,
    });
    const label = String(row.label ?? "").trim();
    if (label) entry.labels.set(label, (entry.labels.get(label) ?? 0) + searches);
  }

  const out: HotSearchTerm[] = [];
  for (const [term, entry] of byTerm) {
    const termLen = Array.from(term).length;
    if (termLen < o.minTermLen || termLen > o.maxTermLen) continue;
    // 参考码（UUID/公告编号）不是业务检索词，不进热榜
    if (isLikelyReferenceCode(term)) continue;

    let searches = 0;
    let hits = 0;
    for (const v of entry.visitors.values()) {
      const capped = Math.min(v.searches, o.perVisitorCap);
      searches += capped;
      hits += Math.min(v.hits, capped);
    }
    const visitors = entry.visitors.size;
    if (visitors < o.minVisitors) continue;
    if (searches < o.minSearches) continue;
    const hitRate = searches > 0 ? hits / searches : 0;
    if (hitRate < o.minHitRate) continue;

    // 展示词：出现次数最多的原文，全无原文时回退归一化词
    let label = term;
    let labelCount = -1;
    for (const [text, count] of entry.labels) {
      if (count > labelCount) { label = text; labelCount = count; }
    }
    out.push({
      term,
      label,
      visitors,
      searches,
      hitRate: Math.round(hitRate * 1000) / 1000,
      score: 10 * visitors + Math.min(searches, 3 * visitors),
    });
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      b.visitors - a.visitors ||
      b.searches - a.searches ||
      a.term.localeCompare(b.term),
  );
  return out.slice(0, o.limit);
}

/**
 * 整体模式判定：数据不足时不要硬展示真实热度（否则会露出「某一个人搜的测试词」）。
 * 窗口内有效搜索 < 200 或合格词 < 5 → fallback（首页回退到现有数据覆盖榜）。
 */
export function decideHotMode(
  input: { totalSearches: number; qualifiedTerms: number },
  opts: { minTotalSearches?: number; minQualifiedTerms?: number } = {},
): HotSearchMode {
  const minTotal = opts.minTotalSearches ?? HOT_SEARCH_DEFAULTS.minTotalSearches;
  const minTerms = opts.minQualifiedTerms ?? HOT_SEARCH_DEFAULTS.minQualifiedTerms;
  const total = Number.isFinite(input.totalSearches) ? input.totalSearches : 0;
  const qualified = Number.isFinite(input.qualifiedTerms) ? input.qualifiedTerms : 0;
  return total >= minTotal && qualified >= minTerms ? "hot" : "fallback";
}
