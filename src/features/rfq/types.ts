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
  categoryL3: string;
  purchaseType: PurchaseType;
  description: string;
  // Step 2 商务条款
  budget: string;
  budgetConfidential: boolean;
  currency: string;
  // 交付地点（手动填写完整地址，含国家/省/市；不再做省市区级联与省份筛选）
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

/** 需求广场卡片（数据来自 GET /api/rfq/list，v2 读模型） */
export interface PlazaRfq {
  id: number;
  /** 需求编号（平台生成：OSRFQ-{年}-{序号}） */
  reference?: string;
  title: string;
  status?: string;
  categoryCode?: string;
  /** 一级分类名称 */
  categoryL1?: string;
  /** 二级分类名称 */
  categoryL2?: string;
  /** 交付省份（新行为空，前端用 address 兜底） */
  province?: string;
  quantity?: number | null;
  quantityUnit?: string;
  /** 预算（元）；保密时 null */
  budgetAmount: number | null;
  budgetConfidential?: boolean;
  currency: string;
  /** 报价截止（秒） */
  closeAt: number | null;
  createdAt?: number | null;
  responses: number;
}
