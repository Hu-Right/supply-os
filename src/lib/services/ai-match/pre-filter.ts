/**
 * AI 匹配候选粗筛（规则引擎，纯函数）
 * @module lib/services/ai-match/pre-filter
 * @description 资源库供应商数量超过 LLM 精评上限时，先按"骨架节点码层级匹配优先 +
 *              行业/产品/认证词项重叠兜底"规则打分排序，只对得分最高的候选做 LLM
 *              精评，控制成本与延迟。分档对齐 search-orchestrator 口径：取最深
 *              命中层级（L2~L5，L1 过宽不计）× 1000 定档，词项分仅同档内竞争；
 *              无码/不命中/未传节点码数据时行为与词项重叠版逐字一致。
 *              2026-10-11：两侧的键由旧字典 `crm_unspsc_codes` 的行 id 换成骨架节点码
 *              `UGT-B-*`（同一请求里两套键并存就是分叉温床，与检索侧同一理由）。
 */
import { backboneNodeLevel } from "../commodity/backbone-path";

/** 粗筛所需的公告文本字段（均为可选，缺失按空串处理） */
export interface PreFilterNotice {
  title?: unknown;
  description?: unknown;
  eligibility?: unknown;
  technical_hurdles?: unknown;
  supplier_conditions?: unknown;
}

/** 粗筛所需的供应商画像字段（全部可选，兼容 repo 层的宽行类型 Record<string, unknown>） */
export interface PreFilterSupplier {
  pool_id?: unknown;
  /** 平台供应商 id（UNSPSC 层级匹配接入键；缺失/为 0 时仅词项参与） */
  supplier_id?: unknown;
  industry?: unknown;
  products?: unknown;
  certification?: unknown;
}

/** 粗筛所需的层级匹配数据：两侧都是骨架节点码集合（`UGT-B-*`，均含全部祖先） */
export interface PreFilterMatchData {
  /** 公告侧：宽表 backbone_path 拆出的节点码 */
  noticeNodes: Set<string>;
  /** 供应商侧：supplier_id → 兴趣码换算出的节点码 */
  supplierNodes: Map<number, Set<string>>;
}

/** 画像字段常见分隔符：行业/产品/认证多为逗号（中英文）、顿号、斜杠、分号列表 */
const TERM_SEPARATORS = /[,，、/|;；\n\r]+/;

/**
 * 从供应商画像提取匹配词项（行业 + 主营产品 + 认证）。
 * 小写归一、按分隔符切词、过滤长度 < 2 的碎片并去重。
 */
export function extractSupplierTerms(supplier: PreFilterSupplier): string[] {
  const raw = [supplier.industry, supplier.products, supplier.certification]
    .map((v) => String(v ?? ""))
    .join("\n");
  const terms = raw
    .split(TERM_SEPARATORS)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
  return [...new Set(terms)];
}

/** 拼接公告侧匹配语料（标题 + 描述 + 资格/技术/供应商条件），小写归一 */
export function buildNoticeCorpus(notice: PreFilterNotice): string {
  return [
    notice.title,
    notice.description,
    notice.eligibility,
    notice.technical_hurdles,
    notice.supplier_conditions,
  ]
    .map((v) => String(v ?? ""))
    .join("\n")
    .toLowerCase();
}

/** 词项重叠打分：每命中一个词项 +2 */
export function scoreSupplierAgainstNotice(corpus: string, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    if (corpus.includes(term)) score += 2;
  }
  return score;
}

/**
 * 节点码定档：取两侧节点码集合交集里最深的一层（形制不符的脏 token 不参与）。
 * 为什么交集就够、不必逐对算共享前缀：两侧存的都是「自身 + 全部祖先」（宽表列值与
 * `pathOf` 的契约），两条链共享到第 d 层 ⇔ 第 d 层那个码同时出现在两侧 ⇒ 取交集最深层
 * 等价于「逐对 sharedDepth 取最大」（单测里直接按 sharedDepth 对拍钉住这一条）。
 * 取这个写法还有一个量的原因：一条巨量码公告可有 5,000+ 个节点码，逐对乘上几百家供应商就是
 * 几千万次比较，而候选集本意是给 LLM 精评省时间。
 * L1 命中不计档（与 search-orchestrator 口径一致：大类过宽，会引入跨行业误报）；
 * 任一侧为空/无交集 → 0（回落词项竞争）。
 */
export function nodeTier(
  supplierNodes: Set<string> | undefined,
  noticeNodes: Set<string>,
): number {
  if (!supplierNodes || supplierNodes.size === 0 || noticeNodes.size === 0) return 0;
  let best = 0;
  for (const node of supplierNodes) {
    const level = backboneNodeLevel(node); // 形制判定只有一份，脏码一律 0 档
    if (level >= 2 && level > best && noticeNodes.has(node)) best = level;
  }
  return best;
}

export interface PreFilterResult<T extends PreFilterSupplier> {
  /** 按匹配度降序的全部候选（含零分），供上层披露"评估了 N/M 家" */
  ranked: Array<{ supplier: T; matches: number }>;
  /** 入选 LLM 精评的前 limit 个候选 */
  candidates: T[];
}

/** 档位与词项分的量级隔离：档差 1000，词项分（含极限重叠）不可翻盘 */
const TIER_UNIT = 1000;

/**
 * 粗筛主入口：骨架节点码分档（tier × 1000）+ 词项重叠分，降序取前 limit 个。
 * 排序稳定（ES2019+），同分保持资源库原有顺序（按添加时间），结果可预期；
 * 不传节点码数据即纯词项重叠版，与旧行为逐字一致。
 */
export function preFilterSuppliers<T extends PreFilterSupplier>(
  notice: PreFilterNotice,
  suppliers: T[],
  limit: number,
  data?: PreFilterMatchData,
): PreFilterResult<T> {
  const corpus = buildNoticeCorpus(notice);
  const ranked = suppliers
    .map((supplier) => {
      const term = scoreSupplierAgainstNotice(corpus, extractSupplierTerms(supplier));
      const sid = Number(supplier.supplier_id ?? 0);
      const tier = data && sid > 0 ? nodeTier(data.supplierNodes.get(sid), data.noticeNodes) : 0;
      return { supplier, matches: tier * TIER_UNIT + term };
    })
    .sort((a, b) => b.matches - a.matches);
  return { ranked, candidates: ranked.slice(0, limit).map((r) => r.supplier) };
}
