/**
 * 采购平台占位名与买家噪声名识别。
 *
 * 两类值都不来自真实采购机构，不应参与机构类型聚合，也不应作为对外 buyer_name 展示：
 * ① 平台占位名——source 页面把平台名/平台码写进 buyer 字段；
 * ② 爬虫噪声名（2026-10-30 剔除口径）——错误页标题（"Error 500..."）、URL、
 *    纯数字/编号、控制字符、通用标签（"Nonprofit organization"）。
 * 注意：判定作用于别名解析之后的 canonical——别名把噪声名映射到真名属运维修正，放行
 * （notice-core normalizeBuyerCountry 的调用序保证）。
 */
const EXACT = new Set([
  "SAM",
  "EPROCURE_GOV_IN",
  "ETENDERS_GOV_ZA",
  "CONTRACTS_FINDER",
  "TENDERSGE",
  "ZAKUPKI_OKMOT_POPP",
  "OPERATOR SEAP",
  "AVENUE-WEB SYSTÈMES",
  "MONGOLIA E-PROCUREMENT SYSTEM (TENDER.GOV.MN)",
  "GOVERNMENT PROCUREMENT PORTAL OF THE REPUBLIC OF KAZAKHSTAN",
  "EPROCUREMENT.GOV.TJ",
  "NONPROFIT ORGANIZATION",
]);

const PLACEHOLDER_RE = /(e-?procurement|procurement\s+(?:system|portal)|contracts?[_\s-]?finder|tenders?\.?gov|zakupki|operator\s+seap|avenue-web|error\s+500|https?:\/\/|www\.)/i;

// ── 整句式假机构名（2026-11-11 剔除口径）─────────────────────────────────
// 现象：部分源站的正文/摘要被 LLM 或机翻污染后，整句话被写进 agency 字段，例如
//   "The Bible is a book of scriptures" / "The local authority is a blessing." /
//   "A common disease is waiting" / "以下是欧洲国家列表"。
// 这类值不是机构，不应作为对外 buyer_name，也不该被当成实体去建档（此前一批中文名
// 正是在这类假名上做出来的）。判定必须高精度：真实机构名里出现 "is" 的极少，
// 且法定名壳（COMMUNALNÉ PIDPRIEMSTVO "…"）里引号内是真名，不判噪声。
const LEGAL_FORM_HEAD =
  /^\s*(communal|comunal|communality|communaln|komunal|pidpriemstvo|pidpriemstva|pidpriemstvy|derzhavn|municipal|община|комунал)/i;

const SENTENCE_HEADS: RegExp[] = [
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

/** 句子形态：句首冠词 + be 动词 */
const SENTENCE_SHAPE = /^(the|a|an)\s/i;
const BE_VERB = /\b(is|are|was|were|has been|have been|does not|says|is located|was established|is called)\b/i;
/** 决策/事件句式（2026-11-12 剔除口径：LLM 幻觉整句再漏网的两例形态） */
const DECISION_RE =
  /\b(has\s+decided|has\s+been\s+decided|in\s+order\s+to|are\s+invited\s+to|on\s+the\s+merits\s+of\s+the\s+contract|destruction\s+of\s+(?:his|her|their))\b/i;
/** 站点导航文本（页面菜单被抓成买家名） */
const NAV_TEXT = /(FAQS|Sitemap|Contact Support|About us|Privacy Policy|Account Access)/i;
/** 同一片段重复 5 次以上（采集拼接残渣） */
const REPEATED = /(.{2,8})\1{5,}/;

function isSentenceNoise(name: string): boolean {
  const s = name.trim();
  if (!s) return false;
  // 法定名壳：引号内是真实机构名，保留交人工/引擎处理
  if (LEGAL_FORM_HEAD.test(s)) return false;
  if (s.length > 300) return true;
  if (NAV_TEXT.test(s)) return true;
  if (REPEATED.test(s)) return true;
  if (DECISION_RE.test(s)) return true;
  for (const re of SENTENCE_HEADS) if (re.test(s)) return true;
  if (SENTENCE_SHAPE.test(s) && BE_VERB.test(s)) return true;
  if (s.length > 60 && BE_VERB.test(s)) return true;
  return false;
}

export function isAgencyPlaceholder(name: string): boolean {
  const normalized = name.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized) return false;
  if (EXACT.has(normalized)) return true;
  if (PLACEHOLDER_RE.test(name)) return true;
  if (isSentenceNoise(name)) return true;
  // 纯数字/编号（"113"、"2026/001"）：不是机构名
  if (/^[\d\s.,:/()\-–—]+$/.test(normalized)) return true;
  // 控制字符：爬虫解析产物，非可展示名
  // eslint-disable-next-line no-control-regex -- 刻意匹配控制字符识别爬虫脏名；保留 \t\n\r 等空白控制符不作占位符
  if (/[\u0000-\u0008\u000e-\u001f]/.test(name)) return true;
  return false;
}
