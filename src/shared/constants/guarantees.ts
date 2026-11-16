/**
 * 保函/质保金要求（F02 商务条款）
 *
 * @module shared/constants/guarantees
 * @description 每种担保不是“勾一下”就够：还需要形式（银行/保险/现金）、
 *              比例或金额、有效期/退还节点。结构存 JSON，类型列表仍写回
 *              projects.guarantees 供旧接口/展示兼容。
 */

export const GUARANTEE_TYPES = [
  "bid_bond",
  "performance_bond",
  "advance_payment",
  "warranty_deposit",
  "other",
] as const;
export type GuaranteeType = (typeof GUARANTEE_TYPES)[number];

export const GUARANTEE_FORMS = ["bank", "insurance", "cash"] as const;
export type GuaranteeForm = (typeof GUARANTEE_FORMS)[number];

export const GUARANTEE_BASES = ["percent", "amount"] as const;
export type GuaranteeBasis = (typeof GUARANTEE_BASES)[number];

export interface GuaranteeRequirement {
  type: GuaranteeType;
  /** other 时的自定义名称 */
  otherName: string;
  form: GuaranteeForm;
  basis: GuaranteeBasis;
  /** 比例（0-100）或金额；null = 未填 */
  value: number | null;
  /** 有效期/退还节点 */
  note: string;
}

export const GUARANTEE_NOTE_MAX = 200;

export function guaranteeDefault(type: GuaranteeType): GuaranteeRequirement {
  return { type, otherName: "", form: "bank", basis: "percent", value: null, note: "" };
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function isType(value: string): value is GuaranteeType {
  return (GUARANTEE_TYPES as readonly string[]).includes(value);
}

function normalizeOne(raw: unknown): GuaranteeRequirement | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const type = str(item.type) as GuaranteeType;
  if (!isType(type)) return null;
  const form = (GUARANTEE_FORMS as readonly string[]).includes(str(item.form))
    ? (str(item.form) as GuaranteeForm)
    : "bank";
  const basis = (GUARANTEE_BASES as readonly string[]).includes(str(item.basis))
    ? (str(item.basis) as GuaranteeBasis)
    : "percent";
  const rawValue = item.value == null || item.value === "" ? null : Number(item.value);
  const value = rawValue != null && Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : null;
  return {
    type,
    otherName: str(item.otherName).slice(0, 120),
    form,
    basis,
    value,
    note: str(item.note).slice(0, GUARANTEE_NOTE_MAX),
  };
}

/**
 * 兼容两种存量：
 * - 新：guarantee_config JSON 数组；
 * - 旧：guarantees 逗号分隔的类型列表。
 */
export function parseGuarantees(value: unknown, fallbackTypes?: unknown): GuaranteeRequirement[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) raw = null;
    else {
      try {
        raw = JSON.parse(value);
      } catch {
        raw = null;
      }
    }
  }
  if (Array.isArray(raw)) {
    const parsed = raw.map(normalizeOne).filter((item): item is GuaranteeRequirement => item !== null);
    if (parsed.length > 0) {
      const seen = new Set<string>();
      return parsed.filter((item) => {
        if (seen.has(item.type)) return false;
        seen.add(item.type);
        return true;
      });
    }
  }
  const fallback = Array.isArray(fallbackTypes) ? fallbackTypes : String(fallbackTypes ?? "").split(",");
  return fallback
    .map((t) => str(t))
    .filter(isType)
    .filter((type, index, list) => list.indexOf(type) === index)
    .map(guaranteeDefault);
}

export function serializeGuarantees(list: unknown): string | null {
  const parsed = parseGuarantees(list);
  return parsed.length > 0 ? JSON.stringify(parsed) : null;
}

/** 类型列表（写回 guarantees 旧列） */
export function guaranteeTypes(list: GuaranteeRequirement[]): string {
  return list.map((item) => item.type).join(",");
}
