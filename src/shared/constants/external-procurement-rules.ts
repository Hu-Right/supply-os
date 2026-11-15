/**
 * 采购方「适用外部采购规则」预设项与编解码
 * Applicable external procurement rules: presets + legacy-safe codec
 *
 * @module shared/constants/external-procurement-rules
 * @description 采购方主体认证表单让采购方选择「用谁的规矩采购」（世行 / 联合国 /
 *              政府采购等），而不是自由填写一段无法归一化的文本。
 *
 *              存储零迁移：仍写回 procurement_buyers.external_rules VARCHAR(255)，
 *              格式为 `code1,code2|其他规则/版本/项目编号`。
 *              - `|` 之前是预设 code 列表，之后是自由补充文本；
 *              - 历史自由文本（不含合法 code 前缀）整体回退为 other，保证老数据不丢；
 *              - buyerRiskFlags 只判断非空，无需改动。
 *
 *              标签走 i18n：`pc_brule_<code>`，分组标题 `pc_brules_group_<key>`。
 *              不要复用 supplier_certifications —— 那是「供应商持有的凭证」，
 *              语义与采购方「须遵守的规则体系」不同。
 */

export const EXTERNAL_RULE_CODES = [
  "worldbank",
  "adb",
  "aiib",
  "ungm",
  "undp",
  "unicef",
  "gov_cn",
  "gov_eu",
  "gov_us",
] as const;

export type ExternalRuleCode = (typeof EXTERNAL_RULE_CODES)[number];

export interface ExternalRuleGroup {
  labelKey: string;
  codes: readonly ExternalRuleCode[];
}

export const EXTERNAL_RULE_GROUPS: readonly ExternalRuleGroup[] = [
  { labelKey: "pc_brules_group_ifi", codes: ["worldbank", "adb", "aiib"] },
  { labelKey: "pc_brules_group_un", codes: ["ungm", "undp", "unicef"] },
  { labelKey: "pc_brules_group_gov", codes: ["gov_cn", "gov_eu", "gov_us"] },
] as const;

/** 自由补充文本上限：head 最长约 90 字符，合计稳定落在 varchar(255) 内 */
export const EXTERNAL_RULE_NOTE_MAX = 120;

const CODE_SET: ReadonlySet<string> = new Set(EXTERNAL_RULE_CODES);
const SEPARATOR = "|";

export interface DecodedExternalRules {
  codes: string[];
  other: string;
}

function parseCodes(head: string): string[] | null {
  const parts = head
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.every((p) => CODE_SET.has(p)) ? parts : null;
}

/**
 * 解析 external_rules 字段。
 * 兼容三种形态：新格式 `codes|note`、新格式无备注 `codes`、历史自由文本。
 */
export function decodeExternalRules(value: string | null | undefined): DecodedExternalRules {
  const raw = String(value ?? "").trim();
  if (!raw) return { codes: [], other: "" };

  const sepAt = raw.indexOf(SEPARATOR);
  if (sepAt >= 0) {
    const codes = parseCodes(raw.slice(0, sepAt));
    if (codes) return { codes, other: raw.slice(sepAt + 1).trim() };
  } else {
    const codes = parseCodes(raw);
    if (codes) return { codes, other: "" };
  }
  // 历史自由文本或含分隔符的旧值：整体作为补充文本，不丢数据
  return { codes: [], other: raw };
}

/** 编回单列字符串；未知 code 会被丢弃，备注中的分隔符会替换为空格 */
export function encodeExternalRules(codes: readonly string[], other: string): string {
  const head = codes.filter((c) => CODE_SET.has(c)).join(",");
  const note = String(other ?? "")
    .replace(/\|/g, " ")
    .trim()
    .slice(0, EXTERNAL_RULE_NOTE_MAX);
  return note ? `${head}${SEPARATOR}${note}` : head;
}

/** i18n key：调用方用 t(ruleLabelKey(code)) 取标签 */
export function ruleLabelKey(code: string): string {
  return `pc_brule_${code}`;
}
