/**
 * Notice type 展示层 — i18n 键映射 + 前端筛选枚举（SSOT·展示层）
 * Notice type presentation layer — i18n mapping + filter enumeration
 *
 * @module shared/utils/notice-type
 * @description 归一化「逻辑」已收敛至 shared/constants/notice-type 的唯一 normalizeNoticeType。
 *              本文件不再自带第二套正则，只负责把标准码映射为 i18n 键、并派生前端筛选枚举，
 *              实现「单一数据源驱动展示」。
 *              未识别的长尾脏值仍返回 null，交由调用方原样回退（不硬塞"其他"、不假装命中）。
 */
import type { LocaleKey } from "@/core/i18n";
import { NOTICE_TYPE_CODES, normalizeNoticeType, type NoticeTypeStdCode } from "@/shared/constants/notice-type";

// 标准短代码 → i18n 键（唯一映射表，键集与 NOTICE_TYPE_CODES 一一对应）。
// 注意：原始别名（ITT/PRE/AO/AOI…）不在此表——它们先经 normalizeNoticeType 收敛为 std 码，
// 再落到此处，杜绝别名与正码两张表各自维护导致的漂移。
export const CODE_TO_LOCALE_KEY: Record<NoticeTypeStdCode, LocaleKey> = {
  ITB: "procurement_type_itb",
  RFQ: "procurement_type_rfq",
  RFP: "procurement_type_rfp",
  EOI: "procurement_type_eoi",
  PQ: "procurement_type_prequalification",
  IC: "procurement_type_consultant",
  RFI: "procurement_type_rfi",
  GPN: "procurement_type_gpn",
  AWARD: "procurement_type_contract_award",
  CONTRACT_NOTICE: "procurement_type_contract_notice",
  COMPETITIVE: "procurement_type_competitive",
  THRESHOLD: "procurement_type_threshold",
  PIN: "procurement_type_pin",
  PMC: "procurement_type_pmc",
  NEGOTIATED: "procurement_type_negotiated",
  SPECIAL_REGIME: "procurement_type_special_regime",
  SERVICES: "procurement_type_services",
  SUPPLIES: "procurement_type_supplies",
  WORKS: "procurement_type_works",
  MULTI_USE_LIST: "procurement_type_multi_use_list",
  DIALOGUE: "procurement_type_dialogue",
  DPS: "procurement_type_dps",
  DESIGN_CONTEST: "procurement_type_design_contest",
  INNOVATION: "procurement_type_innovation",
  RESTRICTED: "procurement_type_restricted",
  SUBCONTRACT: "procurement_type_subcontract",
  QUAL_SYSTEM: "procurement_type_qualification_system",
  SHORTLIST: "procurement_type_shortlist",
  FRAMEWORK: "procurement_type_framework",
  DIRECT_CONTRACTING: "procurement_type_direct_contracting",
  REQUEST: "procurement_type_request",
  // B 轮新增采购/通知形态
  AUCTION: "procurement_type_auction",
  LOW_VALUE: "procurement_type_low_value",
  PATRIMONIAL: "procurement_type_patrimonial",
  AMENDMENT: "procurement_type_amendment",
  OTHER: "procurement_type_other",
};

/**
 * 将数据库 notice_type 的原始值映射为 i18n 键。
 * 逻辑完全委托唯一归一器 normalizeNoticeType，本函数只做「std 码 → LocaleKey」查表。
 *
 * 边界：normalizeNoticeType 对「空值」与「无法识别的长尾脏值」都返回 "OTHER"（其他桶）。
 * 展示层须区分二者——
 *  - 原值字面就是 "OTHER" 码 → 归 i18n「其他」；
 *  - "OTHER" 是兜底产物（原值不认识/为空）→ 返回 null，让徽章回退原文，
 *    避免把长尾脏值一律误标为"其他"（保持既有 null 契约与 UX）。
 */
export function noticeTypeKey(raw: string | undefined | null): LocaleKey | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const std = normalizeNoticeType(trimmed);
  if (std === "OTHER" && trimmed.toUpperCase() !== "OTHER") return null;
  return CODE_TO_LOCALE_KEY[std as NoticeTypeStdCode] ?? null;
}

/**
 * 无 locale 的展示场景（SEO 服务端页等）：返回归一后的标准码字符串，与站内同口径。
 * 与 noticeTypeKey 同一条边界：未识别长尾回退**原始值**（不把脏值伪装成 OTHER、也不外泄 OTHER 噪声）；
 * 空值返回空串，由调用方决定是否兜底文案。
 */
export function noticeTypeCodeLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const std = normalizeNoticeType(trimmed);
  if (std === "OTHER" && trimmed.toUpperCase() !== "OTHER") return trimmed;
  return std;
}

/**
 * 高级搜索「采购方式」筛选下拉的唯一数据源。
 * 由 std 码枚举派生标签键，杜绝此前手写 { value, labelKey } 与归一化体系漂移
 *（如旧值 "DIRECT" 并非标准码、normalizeNoticeType 实际落 OTHER，导致筛选静默失效）。
 * 仅暴露主流形态子集；如需全量类型，直接 map(NOTICE_TYPE_CODES) 即可，口径已在唯一源收敛。
 */
const FILTERABLE_NOTICE_TYPE_CODES: NoticeTypeStdCode[] = [
  "ITB", "RFQ", "RFP", "EOI", "PQ",
  "AWARD", "GPN", "RFI",
  "COMPETITIVE", "FRAMEWORK", "DIRECT_CONTRACTING", "RESTRICTED", "PIN", "PMC",
];

export const NOTICE_TYPE_FILTER_OPTIONS: Array<{ value: string; labelKey: LocaleKey }> = [
  { value: "", labelKey: "procurement_noticeTypeAll" },
  ...FILTERABLE_NOTICE_TYPE_CODES.map((code) => ({ value: code, labelKey: CODE_TO_LOCALE_KEY[code] })),
];

// 供跨端复用（如测试校验枚举覆盖）：标准码全集来自唯一逻辑源。
export { NOTICE_TYPE_CODES };
