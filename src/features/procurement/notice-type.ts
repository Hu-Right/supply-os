/**
 * Notice type normalization
 *
 * @module features/procurement/notice-type
 * @description 将数据库 notice_type 的原始值（英文枚举/中文/中英混排长文本）
 *              归一化为 i18n 键，未命中的长尾脏值返回 null 由调用方原样回退。
 *              映射规则基于 crm_bid_notices / crm_bid_opportunities 两表实测去重值。
 *              Maps raw DB notice_type values to LocaleKeys; returns null for
 *              unrecognized long-tail values so callers fall back to raw text.
 */
import type { LocaleKey } from "@/core/i18n";

// 短代码精确匹配（大小写不敏感）
const CODE_MAP: Record<string, LocaleKey> = {
  ITB: "procurement_type_itb",
  ITT: "procurement_type_itb",
  RFQ: "procurement_type_rfq",
  RFP: "procurement_type_rfp",
  EOI: "procurement_type_eoi",
  PQ: "procurement_type_prequalification",
  PRE: "procurement_type_prequalification",
  IC: "procurement_type_consultant",
  RFI: "procurement_type_rfi",
  GPN: "procurement_type_gpn",
  OTHER: "procurement_type_other",
};

// 子串规则按优先级排列：
// ITB 先于 EOI（"投标邀请书(ITB)-框架协议"含"意向表达"但应归 ITB），
// ITB 先于 request（"Request for Bid(Open-Tender)"应归 ITB 而非 request），
// framework 先于 EOI（含"框架协议"的 ITB 文本不被"意向表达"误匹配），
// EOI 先于资格预审（"意向表达…预审阶段"归 EOI），
// RFQ/RFP/资格预审先于 ITB（"报价请求…重新招标"归 RFQ）
const PATTERN_RULES: Array<[LocaleKey, RegExp]> = [
  ["procurement_type_rfq", /quotation|报价|询价/],
  ["procurement_type_rfp", /\brfp\b|proposal|提案|建议书/],
  ["procurement_type_prequalification", /pre[\s-]?qualif|qualification|资格预审/],
  ["procurement_type_consultant", /consultant|顾问/],
  ["procurement_type_rfi", /request for information|信息征询/],
  ["procurement_type_gpn", /general procurement notice/],
  ["procurement_type_contract_award", /contract award|award notice|授标|中标/],
  // 长尾采购类型：多供应商清单 / 框架协议 / 直接 contracting / 供应商名单
  ["procurement_type_multi_use_list", /multi[\s-]?use list|qualified supplier|vendor list|供应商名单|多用途清单/],
  // 竞争性对话（EU Competitive Dialogue）- 必须在 competitive 之前，避免 "competitive dialogue" 被误匹配
  ["procurement_type_dialogue", /competitive dialogue|dialogue|竞争性对话/],
  // 竞争性公开招标（EU/国际公共采购常见类型）
  ["procurement_type_competitive", /competitive|open bidding|竞争性|公开招标/],
  // EU/National 门槛程序（EU public procurement threshold procedures）
  ["procurement_type_threshold", /threshold procedures|threshold procedure|门槛程序|阈值程序/],
  // 初步市场咨询（Preliminary Market Consultation / PMC）
  ["procurement_type_pmc", /preliminary market consultation|\bpmc\b|初步市场咨询|事前市场咨询/],
  // 限制性程序（EU Restricted Procedure）
  ["procurement_type_restricted", /restricted procedure|restricted|限制性程序|限制程序/],
  // 谈判程序（EU Negotiated Procedure）
  ["procurement_type_negotiated", /negotiated procedure|negotiated|谈判程序/],
  // 创新合作伙伴关系（EU Innovation Partnership）
  ["procurement_type_innovation", /innovation partnership|innovation|创新合作伙伴|创新伙伴关系/],
  // 动态采购系统（EU Dynamic Purchasing System / DPS）
  ["procurement_type_dps", /dynamic purchasing system|\bdps\b|动态采购系统/],
  // 设计竞赛（EU Design Contest）
  ["procurement_type_design_contest", /design contest|design competition|设计竞赛|设计比赛/],
  // 事前信息通知（Prior Information Notice / PIN）
  ["procurement_type_pin", /prior information notice|\bpin\b|事前信息通知|预先信息通知/],
  // 分包通知（Subcontract Notice）- 必须在 contract_notice 之前，避免 "subcontract notice" 被误匹配
  ["procurement_type_subcontract", /subcontract|sub-contract|分包通知|分包公告/],
  // 合同通知（Contract Notice）
  ["procurement_type_contract_notice", /contract notice|合同通知|合同公告/],
  // 资格系统（Qualification System）
  ["procurement_type_qualification_system", /qualification system|资格系统/],
  // 短名单（Shortlist）
  ["procurement_type_shortlist", /shortlist|short list|短名单/],
  // ITB 提前至 framework/EOI/request 之前：避免 "Request for Bid" 被 request 误匹配、
  // "投标邀请书(ITB)-框架协议" 被 framework("框架协议") 或 EOI("意向表达") 误匹配
  ["procurement_type_itb", /\btenders?\b|\bbids?\b|\bitb\b|\bitt\b|招标|投标/],
  ["procurement_type_framework", /framework agreement|framework|standing offer|框架协议/],
  ["procurement_type_direct_contracting", /direct contract|direct procurement|直接合同|直接采购/],
  ["procurement_type_eoi", /expression of interest|express of interest|意向表达|意向征集|\beoi\b/],
  ["procurement_type_request", /request for(?! information)|征询请求|采购请求/],
  ["procurement_type_other", /\bother\b|其他/],
];

export function noticeTypeKey(raw: string | undefined | null): LocaleKey | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const exact = CODE_MAP[trimmed.toUpperCase()];
  if (exact) return exact;

  // 归一化：小写 + 下划线/连字符/括号等转空格，让 \b 边界对 snake_case 生效
  const normalized = trimmed.toLowerCase().replace(/[_\-–—()（）./\\]/g, " ");
  for (const [key, pattern] of PATTERN_RULES) {
    if (pattern.test(normalized)) return key;
  }
  return null;
}
