/**
 * 第三方服务生态静态数据（内容型静态数据统一存放于 src/data）
 * Ecosystem Static Data
 *
 * @module data/ecosystem
 * @description 生态类目表（UI 展示用）；伙伴本体数据已迁库 eco_partner（迁移 062），
 *              经 GET /api/eco-partners 下发，此处不再持有任何伙伴行。
 */

/** 生态伙伴服务类别 */
export type EcoPartnerCategory = "compliance" | "fulfillment" | "after-sales" | "localization";

/** 生态伙伴类目标签（伙伴墙类目条与入驻申请下拉共用） */
export const ECO_PARTNER_CATEGORIES: { key: EcoPartnerCategory; label: string }[] = [
  { key: "compliance", label: "合规准入" },
  { key: "fulfillment", label: "履约交付" },
  { key: "after-sales", label: "售后服务" },
  { key: "localization", label: "本地化运营" },
];
