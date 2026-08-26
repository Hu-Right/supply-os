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
  };
  if (SHORT_CODES[upper]) return SHORT_CODES[upper];

  // [口径一致性修复] 分隔符归一化：与前端 noticeTypeKey 完全同款字符集
  //（下划线/连字符/全角横线/括号/点/斜杠 → 空格），使 \b 单词边界对
  // snake_case 及 "consultation(PMC)" 等粘连形态生效
  const spaced = raw.replace(/[_\-–—()（）./\\]+/g, " ");

  if (/expression of interest|意向表达|意向征集|兴趣征询|\beoi\b/i.test(spaced)) return "EOI";
  if (/quotation|报价|询价/i.test(spaced)) return "RFQ";
  if (/\brfp\b|proposal|提案|建议书/i.test(spaced)) return "RFP";
  if (/pre[\s-]?qualif|资格预审/i.test(spaced)) return "PQ";
  if (/consultant|顾问/i.test(spaced)) return "IC";
  // sources sought（美国 SAM 市场调研公告）语义等同信息征询
  if (/request for information|sources sought|信息征询|\brfi\b/i.test(spaced)) return "RFI";
  if (/general procurement notice|\bgpn\b/i.test(spaced)) return "GPN";
  if (/contract award|award notice|授标|中标/i.test(spaced)) return "AWARD";

  // ── 扩展类型（与前端 PATTERN_RULES 对齐；具体规则先于通用规则）──
  // presolicitation（招标预告）语义属事前信息通知，须在 solicitation 规则前
  if (/prior information notice|presolicitation|\bpin\b|事前信息通知|预先信息通知/i.test(spaced)) return "PIN";
  if (/contract notice|合同通知|合同公告/i.test(spaced)) return "CONTRACT_NOTICE";
  if (/\bthreshold\b|门槛程序|阈值程序/i.test(spaced)) return "THRESHOLD";
  if (/preliminary market consultation|\bpmc\b|初步市场咨询|事前市场咨询/i.test(spaced)) return "PMC";
  if (/\bnegotiated\b|谈判程序|谈判采购/i.test(spaced)) return "NEGOTIATED";
  // 须在 ITB 前："Competitive – Open Bidding" 不得被通用招标规则截胡
  // "Non-Competitive"（非竞争性采购）不得被 \bcompetitive\b 误判
  if (/non[\s-]?competitive/i.test(spaced)) return "OTHER";
  if (/\bcompetitive\b|open bidding|竞争性|公开招标/i.test(spaced)) return "COMPETITIVE";
  // solicitation（美国 SAM 招标书，首页 OTHER 的最大来源）归入 ITB
  if (/solicitation/i.test(spaced)) return "ITB";
  // EU 三大合同分类：西语源数据的主分类（Servicios 先于 Suministros：
  // “Servicios de suministro de personal” 语义属服务而非物资）
  if (/servicio|\bservices?\b/i.test(spaced)) return "SERVICES";
  if (/suministro|\bsupplies\b/i.test(spaced)) return "SUPPLIES";
  if (/\bobras\b|construcci|\bworks\b/i.test(spaced)) return "WORKS";
  if (/\btenders?\b|\bbids?\b|\bitb\b|\bitt\b|招标|投标/i.test(spaced)) return "ITB";

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
