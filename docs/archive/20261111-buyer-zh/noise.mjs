/**
 * 买家名噪声判定（与 src/lib/services/agency/placeholder.ts 同口径）
 *
 * 目标：识别「整句式假机构名」——源站正文被 LLM/机翻污染后写进 agency 字段的句子。
 *
 * 两类分界：
 *  ① 句子壳（The/A/An + be 动词、The following is…、The Bible…）：一律噪声，清空买家字段；
 *  ② 法定名壳（COMMUNALNÉ PIDPRIEMSTVO "…"、PIDPRIEMSTVO "…"）：**不是**噪声，
 *     引号里是真实机构名，交人工/引擎译。
 */

/** 法定名开头（乌克兰/俄语转写），带引号实名，必须保留 */
const LEGAL_FORM_HEAD = /^\s*(communal|comunal|communality|communaln|komunal|pidpriemstvo|pidpriemstva|pidpriemstvy|derzhavn|state\s+(owned|enterprise)|municipal|община|общината|комунал)/i;

/** 明确句首族（LLM 生成假名的典型开头） */
const SENTENCE_HEADS = [
  /^the\s+following\b/i,
  /^the\s+bible\b/i,
  /^the\s+(first|last|next)\s+(is|of)\b/i,
  /^the\s+name\s+(of|is|")/i,
  /^the\s+number\s+of\b/i,
  /^the\s+term\s+is\b/i,
  /^the\s+company\s+is\b/i,
  /^the\s+public'?s?\s+opinion\b/i,
  /^the\s+generic\s+word\b/i,
  /^the\s+most\s+(recent|important|common)\b/i,
  /^the\s+general\s+\w+\s+of\s+the\b/i,
  /^the\s+genus\b/i,
  /^the\s+summary\b/i,
  /^the\s+part\s+of\s+the\s+person\b/i,
  /^the\s+organization\s+of\s+athletic\b/i,
  /^the\s+commission\s+has\s+decided\b/i,
  /^the\s+committee\s+of\s+the\s+regions\s+has\s+decided\b/i,
  /^there\s+(is|are)\b/i,
  /^to\s+the\s+.{0,60}\s+will\s+be\b/i,
  /^a\s+common\s+(disease|feature|day|place|prediction|communication|commercial|advertisement|propaganda|illness)\b/i,
  /^a\s+commonplace\b/i,
  /^"(october|pure|green|cruchevac|i\s+was)/i,
  /^please,?\s+dr\b/i,
  /^-\s*what\?/i,
  /^you\s+are\s+(a|the)\b/i,
  /^eva\s+is\b/i,
];

const SENTENCE_SHAPE = /^(the|a|an)\s/i;
const BE_VERB = /\b(is|are|was|were|has been|have been|does not|says|is located|was established|is called)\b/i;
const NAV_TEXT = /(FAQS|Sitemap|Contact Support|About us|Privacy Policy|Account Access)/i;
const REPEATED = /(.{2,8})\1{5,}/;

/** 登记码前缀（RO 361684 - 真名）：不是噪声，只需去前缀 */
export const REGISTRY_PREFIX = /^[A-Z]{2}\s*\d{5,}\s*[-–—]\s*/;

export function isBuyerNameNoise(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (LEGAL_FORM_HEAD.test(s)) return false;
  if (s.length > 300) return true;
  if (NAV_TEXT.test(s)) return true;
  if (REPEATED.test(s)) return true;
  for (const re of SENTENCE_HEADS) if (re.test(s)) return true;
  if (SENTENCE_SHAPE.test(s) && BE_VERB.test(s)) return true;
  if (s.length > 60 && BE_VERB.test(s)) return true;
  return false;
}

/** 去登记码前缀，取真名 */
export function stripRegistryPrefix(name) {
  return String(name ?? "").replace(REGISTRY_PREFIX, "").trim();
}

/** 从句子壳里抽引号实名（保底救回） */
export function extractQuotedName(name) {
  const m = String(name ?? "").match(/["“]([^"”]{4,120})["”]/);
  return m ? m[1].trim() : "";
}
