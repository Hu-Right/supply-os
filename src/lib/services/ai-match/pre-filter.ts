/**
 * AI 匹配候选粗筛（规则引擎，纯函数）
 * @module lib/services/ai-match/pre-filter
 * @description 资源库供应商数量超过 LLM 精评上限时，先按"UNSPSC 层级匹配优先 +
 *              行业/产品/认证词项重叠兜底"规则打分排序，只对得分最高的候选做 LLM
 *              精评，控制成本与延迟。层级分档对齐 search-orchestrator 口径：取最深
 *              命中层级（L2~L5，L1 过宽不计）× 1000 定档，词项分仅同档内竞争；
 *              无码/不命中/未传 UNSPSC 数据时行为与词项重叠版完全一致。
 */

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

/** UNSPSC 粗筛数据：两侧均为 crm_unspsc_codes 字典 id 字符串（供应商侧含祖先链展开） */
export interface PreFilterUnspscData {
  /** 公告侧：层级(1..5) → 字典 id 集合 */
  noticeLevels: Map<number, Set<string>>;
  /** 供应商侧：supplier_id → 层级(1..5) → 字典 id 集合 */
  supplierLevels: Map<number, Map<number, Set<string>>>;
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
 * UNSPSC 层级定档：取供应商祖先 id 集与公告 id 集的最深命中层级（5→2 优先）。
 * L1 命中不计档（与 search-orchestrator 口径一致：大类过宽，会引入跨行业误报）；
 * 任一侧为空/无交集 → 0（回落词项竞争）。
 */
export function unspscTier(
  supplierLevels: Map<number, Set<string>> | undefined,
  noticeLevels: Map<number, Set<string>>,
): number {
  if (!supplierLevels || supplierLevels.size === 0) return 0;
  for (let level = 5; level >= 2; level -= 1) {
    const sSet = supplierLevels.get(level);
    const nSet = noticeLevels.get(level);
    if (!sSet || !nSet) continue;
    for (const id of sSet) {
      if (nSet.has(id)) return level;
    }
  }
  return 0;
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
 * 粗筛主入口：UNSPSC 层级分档（tier × 1000）+ 词项重叠分，降序取前 limit 个。
 * 排序稳定（ES2019+），同分保持资源库原有顺序（按添加时间），结果可预期；
 * 不传 unspsc 时即纯词项重叠版，与旧行为逐字一致。
 */
export function preFilterSuppliers<T extends PreFilterSupplier>(
  notice: PreFilterNotice,
  suppliers: T[],
  limit: number,
  unspsc?: PreFilterUnspscData,
): PreFilterResult<T> {
  const corpus = buildNoticeCorpus(notice);
  const ranked = suppliers
    .map((supplier) => {
      const term = scoreSupplierAgainstNotice(corpus, extractSupplierTerms(supplier));
      const sid = Number(supplier.supplier_id ?? 0);
      const tier = unspsc && sid > 0
        ? unspscTier(unspsc.supplierLevels.get(sid), unspsc.noticeLevels)
        : 0;
      return { supplier, matches: tier * TIER_UNIT + term };
    })
    .sort((a, b) => b.matches - a.matches);
  return { ranked, candidates: ranked.slice(0, limit).map((r) => r.supplier) };
}
