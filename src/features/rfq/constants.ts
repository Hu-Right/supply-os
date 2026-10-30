/**
 * RFQ 页面常量
 * RFQ Page Constants
 *
 * @module features/rfq/constants
 * @description 发布向导表单选项与默认值。品目分类走 UGT 骨架树接口级联加载。
 */
import type { RfqFormState } from "./types";

/** 币种选项（labelKey → procurement.json 展示名，value 为提交后端的币种代码） */
export const CURRENCY_OPTIONS = [
  { value: "CNY", labelKey: "rfqCurrencyCny" },
  { value: "USD", labelKey: "rfqCurrencyUsd" },
  { value: "EUR", labelKey: "rfqCurrencyEur" },
  { value: "GBP", labelKey: "rfqCurrencyGbp" },
  { value: "JPY", labelKey: "rfqCurrencyJpy" },
  { value: "HKD", labelKey: "rfqCurrencyHkd" },
];

/** 交付条款（Incoterms 常用子集） */
export const INCOTERM_OPTIONS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"];

/**
 * 付款方式（多选）。数组元素为存库/提交后端的原始值，
 * 展示文案经 PAYMENT_LABEL_KEYS 映射到 i18n 键（值保持不变，不影响接口数据）。
 */
export const PAYMENT_OPTIONS = ["T/T 电汇", "L/C 信用证", "平台担保交易", "D/P 付款交单", "预付款+尾款"];

/** 付款方式展示文案 i18n 键映射（key = 存库原始值） */
export const PAYMENT_LABEL_KEYS: Record<string, string> = {
  "T/T 电汇": "rfqPaymentTt",
  "L/C 信用证": "rfqPaymentLc",
  "平台担保交易": "rfqPaymentEscrow",
  "D/P 付款交单": "rfqPaymentDp",
  "预付款+尾款": "rfqPaymentDeposit",
};

/**
 * 期望供应商资质（多选）。数组元素为存库/提交后端的原始值，
 * 展示文案经 SUPPLIER_REQ_LABEL_KEYS 映射到 i18n 键（值保持不变，不影响接口数据）。
 */
export const SUPPLIER_REQ_OPTIONS = [
  "有出口经验", "成立 3 年以上", "工厂直供", "已注册 UNGM", "支持小批量试单", "支持第三方验厂",
];

/** 期望供应商资质展示文案 i18n 键映射（key = 存库原始值） */
export const SUPPLIER_REQ_LABEL_KEYS: Record<string, string> = {
  "有出口经验": "rfqSupplierReqExport",
  "成立 3 年以上": "rfqSupplierReqYears3",
  "工厂直供": "rfqSupplierReqFactory",
  "已注册 UNGM": "rfqSupplierReqUngm",
  "支持小批量试单": "rfqSupplierReqTrial",
  "支持第三方验厂": "rfqSupplierReqAudit",
};

/** 表单默认值（草稿恢复与重置共用） */
export const DEFAULT_RFQ_FORM: RfqFormState = {
  title: "",
  categoryL1: "",
  categoryL2: "",
  categoryL3: "",
  purchaseType: "once",
  description: "",
  budget: "",
  budgetConfidential: false,
  currency: "CNY",
  // 交付地点（手动填写完整地址，含国家/省/市）
  address: "",
  incoterm: "",
  deliveryTime: "",
  paymentTerms: [],
  deadline: "",
  visibility: "public",
  supplierReqs: [],
  attachments: [],
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  agreed: false,
};

