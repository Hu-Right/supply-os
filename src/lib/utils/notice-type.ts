/**
 * notice_type 归一化工具 — 全链路唯一服务端口径
 * Notice type normalization utility
 *
 * @module server/utils/notice-type
 * @description 将混合存储的原始采购类型值映射为标准短代码。
 *              宽表构建（wide-row-builder）、Meili 同步文档、推荐链路（recommend）
 *              与筛选构建（filter-builder）均调用本函数。
 *              （#8 整理，2026-08-20：自 services/meilisearch/sync.ts 迁入，
 *              归一化属领域工具而非同步职责，内容零变更）
 */
export function normalizeNoticeType(raw: string | null | undefined): string {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase().trim();

  const SHORT_CODES: Record<string, string> = {
    ITB: "ITB", ITT: "ITB",
    RFQ: "RFQ", RFP: "RFP",
    EOI: "EOI", PQ: "PQ", PRE: "PQ",
    IC: "IC", RFI: "RFI", GPN: "GPN",
    // AWARD 必须在映射表内：保证函数对自身输出幂等
    //（buildSyncDocFromWideTable 二次归一化时 AWARD 不会漂移为 OTHER）
    AWARD: "AWARD",
    // 扩展类型短代码（与前端 noticeTypeKey CODE_MAP 对齐）；同样承担幂等职责
    PIN: "PIN", PMC: "PMC",
    // EU 三大合同分类（西语源数据 Suministros/Servicios/Obras 的归一化出口）
    SERVICES: "SERVICES", SUPPLIES: "SUPPLIES", WORKS: "WORKS",
    // 新增扩展类型（与前端 PATTERN_RULES 全量对齐）；幂等保障
    CONTRACT_NOTICE: "CONTRACT_NOTICE", COMPETITIVE: "COMPETITIVE",
    THRESHOLD: "THRESHOLD", NEGOTIATED: "NEGOTIATED",
    MULTI_USE_LIST: "MULTI_USE_LIST", DIALOGUE: "DIALOGUE",
    DPS: "DPS", DESIGN_CONTEST: "DESIGN_CONTEST",
    INNOVATION: "INNOVATION", RESTRICTED: "RESTRICTED",
    SUBCONTRACT: "SUBCONTRACT", QUAL_SYSTEM: "QUAL_SYSTEM",
    SHORTLIST: "SHORTLIST", FRAMEWORK: "FRAMEWORK",
    DIRECT_CONTRACTING: "DIRECT_CONTRACTING", REQUEST: "REQUEST",
    // 法语原生采购类型（UNGM / AfD / 北非与西非公共采购的主流形态）：
    // Appel d'offres 系列均为一场招标，归 ITB；AO 与 AOI 只差“国际”限定，同类。
    AO: "ITB", AOI: "ITB", AOD: "ITB", AOM: "ITB",
  };
  if (SHORT_CODES[upper]) return SHORT_CODES[upper];

  // [口径一致性修复] 分隔符归一化：与前端 noticeTypeKey 完全同款字符集
  //（下划线/连字符/全角横线/括号/点/斜杠 → 空格），使 \b 单词边界对
  // snake_case 及 "consultation(PMC)" 等粘连形态生效
  //
  // 重音与撇号剥离（与前端同步新增）：国际公共采购大量值为原生法语
  //（Appel d'offres、Demande de cotation、Manifestation d'intérêt），不剥 accents
  // 则整批落 OTHER、类型筛选完全命中不到；剥后对原有英/西/中文规则无影响
  //（原有规则均为不含重音的前缀或词干）。
  const spaced = raw
    .replace(/[_\-–—()（）./\\]+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u02bc']/g, "")
    .replace(/\s+/g, " ");

  // ── 高优先级：具体类型先于通用类型（与前端 PATTERN_RULES 优先级对齐）──
  if (/expression of interest|express of interest|意向表达|意向征集|兴趣征询|\beoi\b|manifestation\s+dinteret/i.test(spaced)) return "EOI";
  if (/quotation|报价|询价|demande\s+de\s+cotation|demande\s+de\s+prix/i.test(spaced)) return "RFQ";
  if (/\brfp\b|proposal|提案|建议书|demande\s+de\s+propositions/i.test(spaced)) return "RFP";
  if (/pre[\s-]?qualif|qualification|资格预审/i.test(spaced)) return "PQ";
  if (/consultant|顾问/i.test(spaced)) return "IC";
  // sources sought（美国 SAM 市场调研公告）语义等同信息征询
  if (/request for information|sources sought|信息征询|\brfi\b/i.test(spaced)) return "RFI";
  if (/general procurement notice|\bgpn\b/i.test(spaced)) return "GPN";
  if (/contract award|award notice|授标|中标|attribution\s+du\s+marche|avis\s+dattribution/i.test(spaced)) return "AWARD";
  
  // ── 扩展类型（与前端 PATTERN_RULES 对齐；具体规则先于通用规则）──
  // presolicitation（招标预告）语义属事前信息通知，须在 solicitation 规则前
  if (/prior information notice|presolicitation|\bpin\b|事前信息通知|预先信息通知/i.test(spaced)) return "PIN";
  if (/preliminary market consultation|\bpmc\b|初步市场咨询|事前市场咨询/i.test(spaced)) return "PMC";
  // 多用途清单 / 合格供应商名单（须在 competitive 之前，避免 "qualified supplier list" 被误匹配）
  if (/multi[\s-]?use list|qualified supplier|vendor list|供应商名单|多用途清单/i.test(spaced)) return "MULTI_USE_LIST";
  // 竞争性对话（EU Competitive Dialogue）— 须在 competitive 之前，避免 "competitive dialogue" 被截胡
  if (/competitive dialogue|dialogue|竞争性对话/i.test(spaced)) return "DIALOGUE";
  // 动态采购系统（EU Dynamic Purchasing System / DPS）— 须在 competitive 之前
  if (/dynamic purchasing system|\bdps\b|动态采购系统/i.test(spaced)) return "DPS";
  // 设计竞赛（EU Design Contest）
  if (/design contest|design competition|设计竞赛|设计比赛/i.test(spaced)) return "DESIGN_CONTEST";
  // 创新合作伙伴关系（EU Innovation Partnership）
  if (/innovation partnership|innovation|创新合作伙伴|创新伙伴关系/i.test(spaced)) return "INNOVATION";
  // 限制性程序（EU Restricted Procedure）
  if (/restricted procedure|restricted|限制性程序|限制程序/i.test(spaced)) return "RESTRICTED";
  // 谈判程序（EU Negotiated Procedure）
  if (/negotiated procedure|negotiated|谈判程序|谈判采购/i.test(spaced)) return "NEGOTIATED";
  // 门槛程序（EU/National threshold procedures）
  if (/\bthreshold\b|threshold procedures|门槛程序|阈值程序/i.test(spaced)) return "THRESHOLD";
  // 分包通知（Subcontract Notice）— 须在 contract_notice 之前
  if (/subcontract|sub-contract|分包通知|分包公告/i.test(spaced)) return "SUBCONTRACT";
  // 合同通知（Contract Notice）
  if (/contract notice|合同通知|合同公告/i.test(spaced)) return "CONTRACT_NOTICE";
  // 资格系统（Qualification System）
  if (/qualification system|资格系统/i.test(spaced)) return "QUAL_SYSTEM";
  // 短名单（Shortlist）
  if (/shortlist|short list|短名单/i.test(spaced)) return "SHORTLIST";
  // 框架协议（Framework Agreement）— 须在 EOI/request 之前
  if (/framework agreement|framework|standing offer|框架协议/i.test(spaced)) return "FRAMEWORK";
  // 直接合同（Direct Contracting / Direct Procurement）
  if (/direct contract|direct procurement|直接合同|直接采购/i.test(spaced)) return "DIRECT_CONTRACTING";
  // 通用采购请求（request for... 排除已匹配的 RFI/RFP/RFQ）
  if (/request for(?! information)|征询请求|采购请求/i.test(spaced)) return "REQUEST";
  
  // ── Non-Competitive 显式归 OTHER（须在 competitive 规则之前）──
  if (/non[\s-]?competitive/i.test(spaced)) return "OTHER";
  // 竞争性公开招标（EU/国际公共采购常见类型）
  if (/\bcompetitive\b|open bidding|竞争性|公开招标/i.test(spaced)) return "COMPETITIVE";
  // solicitation（美国 SAM 招标书）归入 ITB
  if (/solicitation/i.test(spaced)) return "ITB";
  // EU 三大合同分类：西语源数据的主分类（Servicios 先于 Suministros：
  // "Servicios de suministro de personal" 语义属服务而非物资）
  if (/servicio|\bservices?\b/i.test(spaced)) return "SERVICES";
  if (/suministro|\bsupplies\b/i.test(spaced)) return "SUPPLIES";
  if (/\bobras\b|construcci|\bworks\b/i.test(spaced)) return "WORKS";
  // ITB 放在较后位置（与前端对齐）：tenders?|bids? 在 framework/EOI/request 之后
  // 法语「Appel d'offres / Avis d'appel」系同为招标，归同一桶
  if (/\btenders?\b|\bbids?\b|\bitb\b|\bitt\b|招标|投标|appels?\s+doffres|avis\s+dappel/i.test(spaced)) return "ITB";
  
  return "OTHER";
}

/**
 * 采购类型合法性唯一判定端口（SSOT）。
 * N2 收敛（2026-08-20）：原 search.routes.ts 与 search-orchestrator/params.ts 各维护一份
 * 手工白名单（VALID_NOTICE_TYPES），与归一化函数漂移后导致 COMPETITIVE/CONTRACT_NOTICE
 * 等扩展类型筛选被 length>10 规则静默拦截。现类型合法性完全由 normalizeNoticeType 派生：
 * 能归一化为非 OTHER 标准码的输入即合法；显式 "OTHER"（其他桶）作为合法筛选值保留。
 * 新增/修改类型只需改 normalizeNoticeType 一处。
 */
export function isKnownNoticeType(raw: string | null | undefined): boolean {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  if (trimmed.toUpperCase() === "OTHER") return true;
  return normalizeNoticeType(trimmed) !== "OTHER";
}
