/**
 * AI 匹配候选粗筛（规则引擎，纯函数）
 * @module lib/services/ai-match/pre-filter
 * @description 资源库供应商数量超过 LLM 精评上限时，先按"行业/产品/认证词项与公告
 *              文本的重叠度"规则打分排序，只对得分最高的候选做 LLM 精评，控制成本与延迟。
 *              词项重叠为零（画像数据稀疏）时保持资源库原有顺序，保证结果可预期。
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
  industry?: unknown;
  products?: unknown;
  certification?: unknown;
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

export interface PreFilterResult<T extends PreFilterSupplier> {
  /** 按匹配度降序的全部候选（含零分），供上层披露"评估了 N/M 家" */
  ranked: Array<{ supplier: T; matches: number }>;
  /** 入选 LLM 精评的前 limit 个候选 */
  candidates: T[];
}

/**
 * 粗筛主入口：按词项重叠度降序排序后取前 limit 个。
 * 排序稳定（ES2019+），同分保持资源库原有顺序（按添加时间），结果可预期。
 */
export function preFilterSuppliers<T extends PreFilterSupplier>(
  notice: PreFilterNotice,
  suppliers: T[],
  limit: number,
): PreFilterResult<T> {
  const corpus = buildNoticeCorpus(notice);
  const ranked = suppliers
    .map((supplier) => ({
      supplier,
      matches: scoreSupplierAgainstNotice(corpus, extractSupplierTerms(supplier)),
    }))
    .sort((a, b) => b.matches - a.matches);
  return { ranked, candidates: ranked.slice(0, limit).map((r) => r.supplier) };
}
