/**
 * notice_type 归一化 — 全链路唯一逻辑源（SSOT·纯逻辑层）
 * Notice type normalization — single source of truth (pure logic)
 *
 * @module shared/constants/notice-type
 * @description 将混合存储的原始采购类型值（英/西/法/中及中英混排长文本）归一为标准短代码。
 *              本模块是归一化「逻辑」的唯一落地处：宽表构建（wide-row-builder）、Meili 同步、
 *              推荐链路、筛选构建、开放 API，以及前端展示（shared/utils/notice-type 的
 *              noticeTypeKey）均直接或间接调用此处的 normalizeNoticeType。
 *              i18n 键映射与前端枚举选项属「展示」层，另放 shared/utils/notice-type，
 *              以保证本纯逻辑层可被服务端（lib）安全依赖且不牵入 @/core/i18n 运行时。
 *
 *              历史：原实现分置于 lib/utils/notice-type（服务端 std 码）与
 *              shared/utils/notice-type（前端 i18n 键，自带第二套正则）。两层平行演化
 *              导致优先级/覆盖面分叉。现收敛为「一处归一、其余查表」——std 码口径以本文件
 *              的规则顺序为唯一真相。
 */

/** 标准短代码全集（有序）；CODE_TO_LOCALE_KEY 与筛选枚举均以此为准，新增类型只改这里 + 映射表。 */
export const NOTICE_TYPE_CODES = [
  "ITB", "RFQ", "RFP", "EOI", "PQ", "IC", "RFI", "GPN", "AWARD",
  "CONTRACT_NOTICE", "COMPETITIVE", "THRESHOLD", "PIN", "PMC", "NEGOTIATED",
  "SERVICES", "SUPPLIES", "WORKS", "MULTI_USE_LIST", "DIALOGUE", "DPS",
  "DESIGN_CONTEST", "INNOVATION", "RESTRICTED", "SUBCONTRACT", "QUAL_SYSTEM",
  "SHORTLIST", "FRAMEWORK", "DIRECT_CONTRACTING", "REQUEST",
  "AUCTION", "LOW_VALUE", "PATRIMONIAL", "AMENDMENT",
  "OTHER",
] as const;

export type NoticeTypeStdCode = (typeof NOTICE_TYPE_CODES)[number];

// 短代码/别名精确匹配（大小写不敏感，先于任何正则）。
// 每个 std 码都自映射，保证函数对自身输出幂等
//（buildSyncDocFromWideTable 二次归一化时 AWARD/COMPETITIVE 等不会漂移为 OTHER）。
const SHORT_CODES: Record<string, string> = {
  ITB: "ITB", ITT: "ITB", RFT: "ITB",
  RFQ: "RFQ", RFP: "RFP", ITQ: "RFQ",
  EOI: "EOI", PQ: "PQ", PRE: "PQ",
  IC: "IC", RFI: "RFI", GPN: "GPN",
  AWARD: "AWARD",
  // 扩展类型短代码；同样承担幂等职责
  PIN: "PIN", PMC: "PMC",
  // EU 三大合同分类（西语源数据 Suministros/Servicios/Obras 的归一化出口）
  SERVICES: "SERVICES", SUPPLIES: "SUPPLIES", WORKS: "WORKS",
  // 扩展类型（幂等保障）
  CONTRACT_NOTICE: "CONTRACT_NOTICE", COMPETITIVE: "COMPETITIVE",
  THRESHOLD: "THRESHOLD", NEGOTIATED: "NEGOTIATED",
  MULTI_USE_LIST: "MULTI_USE_LIST", DIALOGUE: "DIALOGUE",
  DPS: "DPS", DESIGN_CONTEST: "DESIGN_CONTEST",
  INNOVATION: "INNOVATION", RESTRICTED: "RESTRICTED",
  SUBCONTRACT: "SUBCONTRACT", QUAL_SYSTEM: "QUAL_SYSTEM",
  SHORTLIST: "SHORTLIST", FRAMEWORK: "FRAMEWORK",
  DIRECT_CONTRACTING: "DIRECT_CONTRACTING", REQUEST: "REQUEST",
  // B 轮新增（幂等自映射，保证 std 码再归一不漂移）
  AUCTION: "AUCTION", LOW_VALUE: "LOW_VALUE", PATRIMONIAL: "PATRIMONIAL", AMENDMENT: "AMENDMENT",
  // 法语原生采购类型（UNGM / AfDB / 北非与西非公共采购的主流形态）：
  // Appel d'offres 系列均为一场招标，归 ITB；AO 与 AOI 只差“国际”限定，同类。
  AO: "ITB", AOI: "ITB", AOD: "ITB", AOM: "ITB",
};

// 子串规则按优先级排列（数组顺序即判定顺序：具体类型先于通用类型）。
// 此顺序即收敛后的唯一口径真相（原 lib/utils/notice-type 的 if 序列逐条搬运，行为零变更）。
// 关键排序约束：
//  - quotation/rfp/pre-qualif 先于 ITB（"报价请求…重新招标"归 RFQ）
//  - multi_use_list 先于 competitive（避免 "qualified supplier list" 被 competitive 截胡）
//  - dialogue/dps 先于 competitive（避免 "competitive dialogue" 被 competitive 截胡）
//  - subcontract 先于 contract_notice（避免 "subcontract notice" 被 contract_notice 截胡）
//  - framework 先于 eoi/request（含"框架协议"的文本不被"意向表达"/"request for" 误匹配）
//  - non-competitive 显式归 OTHER，须先于 competitive
//  - pin 先于 solicitation/tenders（presolicitation 属事前通知）
//  - ITB 的 solicitation 规则须在 SERVICES/SUPPLIES/WORKS 之前
const STD_PATTERN_RULES: Array<[NoticeTypeStdCode, RegExp]> = [
  ["EOI", /expression of interest|express of interest|意向表达|意向征集|兴趣征询|\beoi\b|manifestation\s+dinteret/i],
  ["RFQ", /quotation|\bquote\b|price comparison|报价|询价|demande\s+de\s+cotation|demande\s+de\s+prix/i],
  ["RFP", /\brfp\b|proposal|提案|建议书|demande\s+de\s+propositions/i],
  ["PQ", /pre[\s-]?qualif|qualification|invitation to qualify|资格预审/i],
  ["IC", /consultant|merit competition|\bindividual\b|\bfirm\b|顾问/i],
  // sources sought（美国 SAM 市场调研公告）语义等同信息征询
  ["RFI", /request for information|sources sought|信息征询|\brfi\b/i],
  ["GPN", /general procurement notice|\bgpn\b/i],
  ["AWARD", /contract award|award notice|授标|中标|attribution\s+du\s+marche|avis\s+dattribution/i],
  // presolicitation（招标预告）语义属事前信息通知，须在 solicitation 规则前
  ["PIN", /prior information notice|presolicitation|\bpin\b|notice of intent|\bnoi\b|advance notice|agreement intention notice|intent to bundle|voluntary ex ante transparency|special notice|事前信息通知|预先信息通知/i],
  ["PMC", /preliminary market consultation|\bpmc\b|初步市场咨询|事前市场咨询/i],
  // 多用途清单 / 合格供应商名单（须在 competitive 之前）
  ["MULTI_USE_LIST", /multi[\s-]?use list|qualified supplier|vendor list|供应商名单|多用途清单/i],
  // 竞争性对话（EU Competitive Dialogue）— 须在 competitive 之前
  ["DIALOGUE", /competitive dialogue|dialogue|竞争性对话/i],
  // 动态采购系统（EU Dynamic Purchasing System / DPS）— 须在 competitive 之前
  ["DPS", /dynamic purchasing system|\bdps\b|动态采购系统/i],
  ["DESIGN_CONTEST", /design contest|design competition|设计竞赛|设计比赛/i],
  ["INNOVATION", /innovation partnership|innovation|创新合作伙伴|创新伙伴关系/i],
  ["RESTRICTED", /restricted procedure|restricted|限制性程序|限制程序/i],
  ["NEGOTIATED", /negotiated procedure|negotiated|谈判程序|谈判采购/i],
  ["THRESHOLD", /\bthreshold\b|threshold procedures|门槛程序|阈值程序/i],
  // 分包通知（Subcontract Notice）— 须在 contract_notice 之前
  ["SUBCONTRACT", /subcontract|sub-contract|分包通知|分包公告/i],
  ["CONTRACT_NOTICE", /contract notice|avis\s+de\s+marche|合同通知|合同公告/i],
  // ── B 轮新增（现网高频、语义独立的采购/通知形态）──
  // 更正/变更通知（非采购程序、而是公告生命周期，与 AWARD/PIN 同为 notice 阶段，纳入完备性）
  ["AMENDMENT", /announcement amendment|modification notice|corrigendum|agreement update notice|amendment notice/i],
  // 竞价/拍卖（含电子反向拍卖）
  ["AUCTION", /reverse auction|\bauction\b|竞价|拍卖/i],
  // 小额/简易采购（最低价采购、最小价值采购、micro purchase）
  ["LOW_VALUE", /lowest value|minimum value|micro purchase|小额采购|最低价/i],
  // 西语公共资产类合同（patrimonio / demanial：租出、处置、公用物特许）—— 非典型采购合同，单列避免误挂
  ["PATRIMONIAL", /patrimonial|demanial/i],
  ["QUAL_SYSTEM", /qualification system|资格系统/i],
  ["SHORTLIST", /shortlist|short list|短名单/i],
  // 框架协议（Framework Agreement）— 须在 request 之前
  ["FRAMEWORK", /framework agreement|framework|standing offer|框架协议/i],
  ["DIRECT_CONTRACTING", /direct contract|directed contract|direct procurement|sole source|single source|直接合同|直接采购/i],
  // 通用采购请求（request for... 排除已匹配的 RFI）
  ["REQUEST", /request for(?! information| bid| tender| quote)|征询请求|采购请求/i],
  // Non-Competitive 显式归 OTHER（须在 competitive 规则之前）
  ["OTHER", /non[\s-]?competitive/i],
  // 竞争性公开招标（EU/国际公共采购常见类型）
  ["COMPETITIVE", /\bcompetitive\b|open bidding|竞争性|公开招标/i],
  // solicitation（美国 SAM 招标书）归入 ITB
  ["ITB", /solicitation/i],
  // EU 三大合同分类：西语源数据的主分类（Servicios 先于 Suministros：
  // "Servicios de suministro de personal" 语义属服务而非物资）
  ["SERVICES", /servicio|\bservices?\b/i],
  ["SUPPLIES", /suministro|\bsupplies\b|\bgoods\b/i],
  ["WORKS", /\bobra|construcci|\bworks\b/i],
  // ITB 放在较后位置：tenders?|bids? 在 framework/request 之后
  // 法语「Appel d'offres / Avis d'appel」系同为招标，归同一桶
  ["ITB", /\btenders?\b|\bbids?\b|\bitb\b|\bitt\b|open procedure|two\s+stage\s+tender|招标|投标|appels?\s+doffres|avis\s+dappel/i],
];

/**
 * 将任意原始采购类型值归一为标准短代码；未命中返回 "OTHER"（其他桶）。
 * 函数对自身输出幂等（std 码经本函数再次归一仍得同码）。
 */
export function normalizeNoticeType(raw: string | null | undefined): string {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase().trim();
  if (SHORT_CODES[upper]) return SHORT_CODES[upper];

  // 分隔符归一化：下划线/连字符/全角横线/括号/点/斜杠 → 空格，使 \b 单词边界对
  // snake_case 及 "consultation(PMC)" 等粘连形态生效。
  // 重音与撇号剥离：国际公共采购大量原生法语值（Appel d'offres、Demande de cotation、
  // Manifestation d'intérêt），不剥 accents 则整批落 OTHER、类型筛选完全命中不到；
  // 剥后对原有英/西/中文规则无影响（原有规则均为不含重音的前缀或词干）。
  const spaced = raw
    .replace(/[_\-–—()（）./\\]+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u02bc']/g, "")
    .replace(/\s+/g, " ");

  for (const [code, pattern] of STD_PATTERN_RULES) {
    if (pattern.test(spaced)) return code;
  }
  return "OTHER";
}

/**
 * 采购类型合法性唯一判定端口（SSOT）。
 * 类型合法性完全由 normalizeNoticeType 派生：能归一化为非 OTHER 标准码的输入即合法；
 * 显式 "OTHER"（其他桶）作为合法筛选值保留。新增/修改类型只需改本文件一处。
 */
export function isKnownNoticeType(raw: string | null | undefined): boolean {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  if (trimmed.toUpperCase() === "OTHER") return true;
  return normalizeNoticeType(trimmed) !== "OTHER";
}
