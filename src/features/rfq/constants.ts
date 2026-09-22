/**
 * RFQ 页面常量
 * RFQ Page Constants
 *
 * @module features/rfq/constants
 * @description 发布向导表单选项与默认值。类目走 UNSPSC API 级联加载。
 */
import type { RfqFormState } from "./types";

/** 币种选项 */
export const CURRENCY_OPTIONS = [
  { value: "CNY", label: "人民币 (CNY)" },
  { value: "USD", label: "美元 (USD)" },
  { value: "EUR", label: "欧元 (EUR)" },
  { value: "GBP", label: "英镑 (GBP)" },
  { value: "JPY", label: "日元 (JPY)" },
  { value: "HKD", label: "港币 (HKD)" },
];

/** 交付条款（Incoterms 常用子集） */
export const INCOTERM_OPTIONS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"];

/** 付款方式（多选） */
export const PAYMENT_OPTIONS = ["T/T 电汇", "L/C 信用证", "平台担保交易", "D/P 付款交单", "预付款+尾款"];

/** 期望供应商资质（多选） */
export const SUPPLIER_REQ_OPTIONS = [
  "有出口经验", "成立 3 年以上", "工厂直供", "已注册 UNGM", "支持小批量试单", "支持第三方验厂",
];

/** 表单默认值（草稿恢复与重置共用） */
export const DEFAULT_RFQ_FORM: RfqFormState = {
  title: "",
  categoryL1: "",
  categoryL2: "",
  purchaseType: "once",
  description: "",
  budget: "",
  budgetConfidential: false,
  currency: "CNY",
  // 交付地点（省→市→区/县三级联动 + 详细地址）
  provinceId: null,
  provinceName: "",
  cityId: null,
  cityName: "",
  districtId: null,
  districtName: "",
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

