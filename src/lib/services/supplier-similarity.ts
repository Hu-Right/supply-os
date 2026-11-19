/**
 * 供应商相似度打分（纯函数，可单测）
 *
 * @module lib/services/supplier-similarity
 * @description 相似供应商 =「能供同类货 + 同行业 + 产品近似」，地域/质量只做轻量加分。
 *              打分只用库里已有数据：品目兴趣（UGT 码）、主行业码、产品自由文本、国家/省市、完整度。
 *
 *              权重（合计 1）：
 *                品目重叠 0.55（最强信号；按 confidence 加权 Jaccard）
 *                行业相似 0.25（行业树共同前缀，越深越像）
 *                产品文本 0.15（产品短语 Jaccard，品目漏挂时的兜底）
 *                地域      0.03（同国家/省/市递进）
 *                资料质量  0.02（完整度，同分排序用）
 */

export interface SimilarityCommodityCode {
  code: string;
  /** 0~100；缺省按 60 处理，避免无 confidence 的码被当成满分 */
  confidence?: number | null;
}

export interface SupplierSimilarityInput {
  commodityCodes: SimilarityCommodityCode[];
  industryCode: string | null;
  products: string[];
  countryCode?: string | null;
  province?: string | null;
  city?: string | null;
  quality?: number | null;
}

export interface SimilarityScore {
  score: number;
  sharedCodes: string[];
}

const SEPARATORS = /[，,、;；/|]+/;

/** 产品短语 → token 集合：先按分隔符拆，英文再按空白拆，中文短语保整串 */
function productTokens(products: readonly string[]): Set<string> {
  const tokens = new Set<string>();
  for (const raw of products) {
    for (const part of String(raw ?? "").split(SEPARATORS)) {
      const text = part.trim().toLowerCase();
      if (!text) continue;
      if (text.length >= 2) tokens.add(text);
      // 英文/数字短语再拆词，提升 "laser cutting machine" 类产品的重合命中
      if (/[a-z]/.test(text)) {
        for (const word of text.split(/\s+/)) {
          if (word.length >= 3) tokens.add(word);
        }
      }
    }
  }
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/** 品目加权 Jaccard：权重取 confidence/100，缺省 0.6 */
function commoditySimilarity(target: SimilarityCommodityCode[], candidate: SimilarityCommodityCode[]): {
  score: number;
  sharedCodes: string[];
} {
  const weightOf = (c: SimilarityCommodityCode): number => {
    const n = Number(c.confidence);
    return Number.isFinite(n) && n > 0 ? Math.min(1, n / 100) : 0.6;
  };
  const targetMap = new Map<string, number>();
  for (const c of target) {
    if (!c.code) continue;
    targetMap.set(c.code, Math.max(targetMap.get(c.code) ?? 0, weightOf(c)));
  }
  const candidateMap = new Map<string, number>();
  for (const c of candidate) {
    if (!c.code) continue;
    candidateMap.set(c.code, Math.max(candidateMap.get(c.code) ?? 0, weightOf(c)));
  }
  if (targetMap.size === 0 || candidateMap.size === 0) return { score: 0, sharedCodes: [] };

  const sharedCodes: string[] = [];
  let inter = 0;
  for (const [code, w] of targetMap) {
    if (candidateMap.has(code)) {
      sharedCodes.push(code);
      inter += Math.min(w, candidateMap.get(code) ?? 0);
    }
  }
  let union = 0;
  const all = new Set([...targetMap.keys(), ...candidateMap.keys()]);
  for (const code of all) union += Math.max(targetMap.get(code) ?? 0, candidateMap.get(code) ?? 0);
  return { score: union > 0 ? inter / union : 0, sharedCodes };
}

/** 行业码数值部分（去掉 UGT-I-） */
function industryDigits(code: string | null): string {
  return String(code ?? "").trim().replace(/^UGT-I-/i, "");
}

/**
 * 行业相似：按共同前缀长度 / 较长码长度（同级完全一致=1；只同 L1 门类约 0.2~0.25）。
 * 例：UGT-I-06010709 vs UGT-I-06030102 → 共同 "06" → 2/8=0.25。
 */
export function industryCodeSimilarity(a: string | null, b: string | null): number {
  const x = industryDigits(a);
  const y = industryDigits(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  let common = 0;
  const max = Math.min(x.length, y.length);
  while (common < max && x[common] === y[common]) common += 1;
  return common === 0 ? 0 : common / Math.max(x.length, y.length);
}

function geoScore(target: SupplierSimilarityInput, cand: SupplierSimilarityInput): number {
  const tCountry = String(target.countryCode ?? "").trim();
  const cCountry = String(cand.countryCode ?? "").trim();
  if (!tCountry || !cCountry || tCountry !== cCountry) return 0;
  let score = 0.5;
  const tProvince = String(target.province ?? "").trim();
  const cProvince = String(cand.province ?? "").trim();
  if (tProvince && cProvince && tProvince === cProvince) score += 0.3;
  const tCity = String(target.city ?? "").trim();
  const cCity = String(cand.city ?? "").trim();
  if (tCity && cCity && tCity === cCity) score += 0.2;
  return Math.min(1, score);
}

/**
 * 计算单对供应商相似度。
 * @returns score 0~1；sharedCodes 为共享品目码（用于给用户看“同品目”原因）
 */
export function computeSupplierSimilarity(
  target: SupplierSimilarityInput,
  candidate: SupplierSimilarityInput,
): SimilarityScore {
  const commodity = commoditySimilarity(target.commodityCodes, candidate.commodityCodes);
  const industry = industryCodeSimilarity(target.industryCode, candidate.industryCode);
  const product = jaccard(productTokens(target.products), productTokens(candidate.products));
  const geo = geoScore(target, candidate);
  const quality = Math.min(1, Math.max(0, Number(target.quality ?? 0))) * 0.5
    + Math.min(1, Math.max(0, Number(candidate.quality ?? 0))) * 0.5;

  const score =
    commodity.score * 0.55 +
    industry * 0.25 +
    product * 0.15 +
    geo * 0.03 +
    quality * 0.02;

  return { score, sharedCodes: commodity.sharedCodes };
}

/** 相似原因类型：供前端按 locale 生成文案 */
export type SimilarMatchKind = "commodity" | "industry" | "region";

export function resolveMatchKind(score: SimilarityScore, industry: number): SimilarMatchKind {
  if (score.sharedCodes.length > 0) return "commodity";
  if (industry >= 0.4) return "industry";
  return "region";
}
