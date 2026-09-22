/**
 * 增值服务目录 · 结构清单（非自助订阅套餐）
 * Service catalog — structural index; 展示文案走 i18n（六语 membership.json 的 `serviceCatalog` 嵌套键）
 *
 * @module features/membership/data/service-catalog
 * @description 只承载"哪些服务卡、归属哪个 Tab、每张卡几条权益"的**结构**；
 *              名称/价格/服务方式/权益正文由 ServiceCard 通过
 *              t(`serviceCatalog.<id>.<field>`) 从六语取，实现全量本地化。
 *              benefitCount 决定渲染多少条权益（对应 b0..bN 键）。
 *              group：enterprise=企业会员 Tab 内展示；services=增值服务 Tab。
 */

export type ServiceGroup = "enterprise" | "services";

export interface ServiceCatalogItem {
  id: string;
  group: ServiceGroup;
  /** 权益条目数（= 该卡在 i18n 里 b0..b{benefitCount-1} 的个数） */
  benefitCount: number;
}

export const SERVICE_CATALOG: ServiceCatalogItem[] = [
  // ── 二、企业版留资项（随企业会员 Tab）──
  { id: "enterprise_1v1_match", group: "enterprise", benefitCount: 2 },

  // ── 三~十、增值服务目录（增值服务 Tab）──
  { id: "consult_1v1", group: "services", benefitCount: 3 },
  { id: "consult_strategy", group: "services", benefitCount: 4 },
  { id: "consult_fullprocess", group: "services", benefitCount: 2 },
  { id: "value_bid_report", group: "services", benefitCount: 3 },
  { id: "custom_research", group: "services", benefitCount: 2 },
  { id: "ai_bid_doc", group: "services", benefitCount: 2 },
  { id: "negotiation", group: "services", benefitCount: 3 },
  { id: "ka_custom", group: "services", benefitCount: 2 },
  { id: "compliance_single", group: "services", benefitCount: 3 },
  { id: "compliance_annual", group: "services", benefitCount: 1 },
  { id: "api_data", group: "services", benefitCount: 3 },
];
