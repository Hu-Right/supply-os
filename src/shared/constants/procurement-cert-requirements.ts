/**
 * 采购认证要求（F02）— 类型与归一化
 *
 * @module shared/constants/procurement-cert-requirements
 * @description 采购方按认证字典提出要求，一条要求一张卡片：
 *              code（字典锚点；自输入时为空）、name、custom（是否字典未收录）、
 *              mandatory（强制/加分）、note（适用范围）、requireValid（须在有效期内）。
 *              与供应商能力档案 `capability_type='certification'` 的 code 可直接求交集。
 */

export interface CertRequirement {
  /** 字典 code；自输入项为空串 */
  code: string;
  /** 展示名称 */
  name: string;
  /** 字典未收录、采购方自输入 */
  custom: boolean;
  /** true=强制，false=加分 */
  mandatory: boolean;
  /** 适用范围/说明 */
  note: string;
  /** 要求供应商证书在报价截止时仍在有效期内 */
  requireValid: boolean;
}

export const CERT_REQUIREMENT_MAX = 20;
export const CERT_REQUIREMENT_NOTE_MAX = 200;

/** 认证字典分组（与 /api/certifications 的 category 一致） */
export const CERT_CATEGORY_ORDER = [
  "management",
  "industry",
  "market_access",
  "product_safety",
  "esg",
] as const;

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOne(raw: unknown): CertRequirement | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const code = str(item.code);
  const name = str(item.name);
  if (!code && !name) return null;
  return {
    code,
    name,
    custom: item.custom === true || !code,
    mandatory: item.mandatory !== false,
    note: str(item.note).slice(0, CERT_REQUIREMENT_NOTE_MAX),
    requireValid: item.requireValid === true,
  };
}

/**
 * 从 DB 值（JSON 字符串或已解析数组）归一化。
 * 非法 JSON / 非数组一律返回空数组，不抛错（列表页容错优先）。
 */
export function parseCertRequirements(value: unknown): CertRequirement[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeOne)
    .filter((item): item is CertRequirement => item !== null)
    .slice(0, CERT_REQUIREMENT_MAX);
}

/** 落库前序列化（同时做裁剪/去空） */
export function serializeCertRequirements(list: unknown): string | null {
  const parsed = parseCertRequirements(list);
  return parsed.length > 0 ? JSON.stringify(parsed) : null;
}
