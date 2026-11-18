/**
 * 注册标识（Registration ID）类型与校验 —— 供应商 / 采购主体两侧共用
 *
 * @module shared/constants/registration-id
 *
 * @description 背景（2026-11-18）：企业主体识别原先只有「统一社会信用代码」一个口径，
 *              但香港公司（BR/CR 两种号）与海外公司（注册号/税号/VAT/EIN）并没有 18 位
 *              中国码。把 18 位写死会挡住合法主体，把校验完全去掉又会让防重键失效。
 *
 *              这里给出唯一事实源：
 *                ① 类型枚举 + 按国家推导默认类型（中国→USCC、香港→BR、其余→海外注册号）；
 *                ② 归一化（去分隔符、转大写）——**只用于查重**，展示仍用用户填写的原文；
 *                ③ 分级校验：中国 USCC 严格，香港与海外宽松（真伪交给人工核验，不靠前端正则）；
 *                ④ 校验失败码 → 中文文案（服务端直接回显；前端按 `code` 映射 i18n 文案）。
 *
 *              两侧落库列：
 *                - supplier：`credit_code_type` / `credit_code_norm`
 *                - procurement_buyers：`reg_no_type` / `reg_no_norm`
 *              防重键均为 `(类型, 归一号码)`，避免「香港 8 位数字」和别国 8 位数字撞号。
 */

/** 注册标识类型（枚举即事实源，迁移与前端下拉共用） */
export const REGISTRATION_ID_TYPES = [
  "uscc", // 中国大陆统一社会信用代码
  "hk_br", // 香港商业登记号（Business Registration Number）
  "hk_cr", // 香港公司注册编号（Company Registration Number）
  "overseas_reg", // 海外公司注册号
  "tax_id", // 税号 / VAT / EIN 等税务标识
  "other", // 其他（自由文本，必须能说明主体身份）
] as const;

export type RegistrationIdType = (typeof REGISTRATION_ID_TYPES)[number];

/** 默认类型：存量数据与中国大陆主体沿用 USCC */
export const DEFAULT_REGISTRATION_ID_TYPE: RegistrationIdType = "uscc";

/** 号码原文上限（与两侧 varchar(64)/120 列兼容，留出分隔符余量） */
export const REGISTRATION_ID_MAX_RAW_LENGTH = 64;

/** 归一化后上限（落 `*_norm` 列） */
export const REGISTRATION_ID_MAX_NORM_LENGTH = 64;

export function isRegistrationIdType(value: unknown): value is RegistrationIdType {
  return typeof value === "string" && (REGISTRATION_ID_TYPES as readonly string[]).includes(value);
}

/**
 * 归一化：去空格/连字符/斜杠/点/括号等分隔符，统一大写，仅保留 0-9A-Z。
 * 只用于查重与索引，**不得写回展示字段**（用户看到的仍是原文）。
 */
export function normalizeRegistrationId(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, REGISTRATION_ID_MAX_NORM_LENGTH);
}

/** 校验失败码（前端按码映射 i18n，服务端按码取中文文案） */
export type RegistrationIdErrorCode = "required" | "uscc" | "hk_br" | "hk_cr" | "overseas_len" | "too_long";

export type RegistrationIdValidation =
  | { ok: true }
  | { ok: false; code: RegistrationIdErrorCode };

/** 校验失败码 → 中文文案（服务端 400 message 直出；与前端 i18n 同口径） */
export const REGISTRATION_ID_ERROR_ZH: Record<RegistrationIdErrorCode, string> = {
  required: "请填写注册标识号码",
  uscc: "统一社会信用代码应为 18 位数字或大写字母",
  hk_br: "香港商业登记号（BR）应为 8 位数字",
  hk_cr: "香港公司注册编号（CR）应为 7–12 位数字或大写字母",
  overseas_len: "注册号/税号长度应为 2–64 位（可含字母、数字与常见分隔符）",
  too_long: `注册标识号码不能超过 ${REGISTRATION_ID_MAX_RAW_LENGTH} 个字符`,
};

/**
 * 分级校验：
 *  - uscc：18 位数字/大写字母（不做校验位，避免误伤历史手填与旧登记号）；
 *  - hk_br：8 位数字；hk_cr：7–12 位数字/大写字母；
 *  - overseas_reg / tax_id：归一后 2–64 位（原文可带分隔符）；
 *  - other：原文 1–64 位任意字符（例如「暂无注册号，仅有公司注册证书」）。
 * 所有类型都先查原文长度上限。
 */
export function validateRegistrationId(
  type: RegistrationIdType,
  raw: string | null | undefined,
): RegistrationIdValidation {
  const original = String(raw ?? "").trim();
  if (original.length > REGISTRATION_ID_MAX_RAW_LENGTH) return { ok: false, code: "too_long" };

  if (type === "other") {
    return original.length > 0 ? { ok: true } : { ok: false, code: "required" };
  }

  const normalized = normalizeRegistrationId(original);
  if (!normalized) return { ok: false, code: "required" };

  switch (type) {
    case "uscc":
      return /^[0-9A-Z]{18}$/.test(normalized) ? { ok: true } : { ok: false, code: "uscc" };
    case "hk_br":
      return /^[0-9]{8}$/.test(normalized) ? { ok: true } : { ok: false, code: "hk_br" };
    case "hk_cr":
      return /^[0-9A-Z]{7,12}$/.test(normalized) ? { ok: true } : { ok: false, code: "hk_cr" };
    case "overseas_reg":
    case "tax_id":
      return normalized.length >= 2 ? { ok: true } : { ok: false, code: "overseas_len" };
    default:
      return { ok: false, code: "required" };
  }
}

/** 判断国家/地区是否为中国大陆（接受 ISO2 码或中英文名称） */
function isMainlandChina(country: string | null | undefined): boolean {
  const v = String(country ?? "").trim().toLowerCase();
  if (!v) return false;
  return ["cn", "chn", "中国", "中国大陆", "中国内地", "中华人民共和国", "china", "mainland china"].includes(v);
}

/** 判断国家/地区是否为中国香港 */
function isHongKong(country: string | null | undefined): boolean {
  const v = String(country ?? "").trim().toLowerCase();
  if (!v) return false;
  return ["hk", "hkg", "香港", "中国香港", "hong kong", "hongkong"].includes(v);
}

/**
 * 按国家/地区推导默认注册标识类型（用户仍可手动改）：
 *  - 中国大陆 → uscc；香港 → hk_br；其他国家 → overseas_reg；
 *  - 国家为空时维持 uscc（存量主体绝大多数为中国大陆）。
 */
export function defaultRegistrationIdTypeForCountry(
  country: string | null | undefined,
): RegistrationIdType {
  if (isMainlandChina(country)) return "uscc";
  if (isHongKong(country)) return "hk_br";
  if (String(country ?? "").trim() === "") return DEFAULT_REGISTRATION_ID_TYPE;
  return "overseas_reg";
}

/** 类型下拉选项（value + i18n key + 中文兜底），前端两侧共用；i18n key 由调用方命名空间拼 */
export const REGISTRATION_ID_TYPE_OPTIONS: ReadonlyArray<{
  value: RegistrationIdType;
  labelKey: string;
  fallback: string;
}> = [
  { value: "uscc", labelKey: "authRegIdType_uscc", fallback: "统一社会信用代码（中国大陆）" },
  { value: "hk_br", labelKey: "authRegIdType_hk_br", fallback: "商业登记号 BR（香港）" },
  { value: "hk_cr", labelKey: "authRegIdType_hk_cr", fallback: "公司注册编号 CR（香港）" },
  { value: "overseas_reg", labelKey: "authRegIdType_overseas_reg", fallback: "公司注册号（海外）" },
  { value: "tax_id", labelKey: "authRegIdType_tax_id", fallback: "税号 / VAT / EIN" },
  { value: "other", labelKey: "authRegIdType_other", fallback: "其他注册标识" },
];

/** 每种类型对应的号码字段标签 i18n key + 中文兜底 */
export const REGISTRATION_ID_FIELD_LABELS: Record<
  RegistrationIdType,
  { labelKey: string; placeholderKey: string; fallback: string }
> = {
  uscc: {
    labelKey: "authRegIdField_uscc",
    placeholderKey: "authRegIdPh_uscc",
    fallback: "统一社会信用代码（18 位）",
  },
  hk_br: { labelKey: "authRegIdField_hk_br", placeholderKey: "authRegIdPh_hk_br", fallback: "香港商业登记号 BR（8 位数字）" },
  hk_cr: { labelKey: "authRegIdField_hk_cr", placeholderKey: "authRegIdPh_hk_cr", fallback: "香港公司注册编号 CR（7–12 位）" },
  overseas_reg: {
    labelKey: "authRegIdField_overseas_reg",
    placeholderKey: "authRegIdPh_overseas_reg",
    fallback: "海外公司注册号（如 1234567、HRB 123456）",
  },
  tax_id: { labelKey: "authRegIdField_tax_id", placeholderKey: "authRegIdPh_tax_id", fallback: "税号 / VAT / EIN" },
  other: { labelKey: "authRegIdField_other", placeholderKey: "authRegIdPh_other", fallback: "注册标识号码（请说明证件类型）" },
};
