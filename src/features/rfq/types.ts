/**
 * RFQ 页面类型定义
 * RFQ Page Types
 *
 * @module features/rfq/types
 * @description 发布向导表单状态、需求广场卡片等数据结构。
 *              三步流程：需求概要 → 商务条款 → 发布设置。
 *              P1 接入后端后，RfqFormState 即 createRfq 的请求体基线。
 */

/** 附件元数据（前端校验通过后的待上传项；P1 换预签名直传） */
export interface AttachmentItem {
  name: string;
  /** 字节 */
  size: number;
}

/** 采购类型 */
export type PurchaseType = "once" | "framework" | "longterm";

/** 可见范围 */
export type RfqVisibility = "public" | "targeted";

/** 发布向导表单状态（三步收集的完整字段集） */
export interface RfqFormState {
  // Step 1 需求概要
  title: string;
  categoryL1: string;
  categoryL2: string;
  purchaseType: PurchaseType;
  description: string;
  // Step 2 商务条款
  budgetMin: string;
  budgetMax: string;
  currency: string;
  budgetConfidential: boolean;
  // 交付地点（省→市→区/县三级联动 + 详细地址）
  provinceId: number | null;
  provinceName: string;
  cityId: number | null;
  cityName: string;
  districtId: number | null;
  districtName: string;
  address: string;
  incoterm: string;
  deliveryTime: string;
  paymentTerms: string[];
  deadline: string;
  // Step 3 发布设置
  visibility: RfqVisibility;
  supplierReqs: string[];
  attachments: AttachmentItem[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  agreed: boolean;
}

/** 字段级错误信息（key → 错误文案） */
export type FieldErrors = Record<string, string>;

/** 需求广场卡片（P1 替换为 fetchRfqList 真实数据） */
export interface PlazaRfq {
  id: number;
  /** 一级行业（用于行业筛选，对齐 CATEGORY_TREE） */
  industry: string;
  /** 展示用标签文案 */
  tag: string;
  title: string;
  countryZh: string;
  /** 英文名，供 CountryFlag 匹配 ISO2 */
  countryEn: string;
  /** 交付省份 */
  province?: string;
  /** 一级分类名称 */
  categoryL1?: string;
  /** 二级分类名称 */
  categoryL2?: string;
  budgetDisplay: string;
  /** 预算中枢（万美元），用于预算区间筛选 */
  budgetUsd: number;
  /** ISO 日期 yyyy-MM-dd */
  deadline: string;
  responses: number;
  /** 置顶需求 */
  boosted?: boolean;
}
