/**
 * RFQ 页面常量
 * RFQ Page Constants
 *
 * @module features/rfq/constants
 * @description 类目树/单位/国家/认证等枚举与需求广场 Mock 数据。
 *              类目为 UNSPC 大类的简化中文版（P1 接入完整 UNSPC 级联）。
 */
import type { PlazaRfq, RfqFormState } from "./types";

/** 草稿 localStorage 键 */
export const RFQ_DRAFT_KEY = "rfq_publish_draft_v1";

/** 一级/二级类目树 */
export const CATEGORY_TREE: { label: string; children: string[] }[] = [
  { label: "医疗健康", children: ["医疗耗材", "医疗设备", "药品保健品", "实验室用品"] },
  { label: "新能源", children: ["光伏组件", "储能设备", "风电设备", "充电设施"] },
  { label: "工程机械", children: ["工程机械整机", "工程机械配件", "矿山设备", "起重设备"] },
  { label: "化工原料", children: ["基础化工原料", "塑料橡胶", "涂料油墨", "化肥农药"] },
  { label: "农业食品", children: ["农机设备", "食品加工设备", "种子种苗", "农产品"] },
  { label: "信息技术", children: ["计算机设备", "网络通信设备", "软件服务", "安防监控"] },
  { label: "教育设备", children: ["教学仪器", "课桌椅", "实训设备", "体育器材"] },
  { label: "其他", children: ["综合采购", "服务外包", "其他"] },
];

/** 数量单位选项 */
export const UNIT_OPTIONS = [
  "件", "台", "套", "箱", "吨", "千克", "米", "平方米", "千瓦(kW)", "兆瓦(MW)", "集装箱", "批次",
];

/** 币种选项 */
export const CURRENCY_OPTIONS = ["USD", "EUR", "CNY", "SAR", "AED"];

/** 质量与认证要求（含 UN 采购场景的 UNGM 注册） */
export const CERT_OPTIONS = [
  "ISO 9001", "ISO 13485", "ISO 22000", "CE", "FDA", "UL", "FCC", "HACCP", "SGS 验厂报告", "UNGM 注册",
];

/** 交付条款（Incoterms 常用子集） */
export const INCOTERM_OPTIONS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"];

/** 付款方式（多选） */
export const PAYMENT_OPTIONS = ["T/T 电汇", "L/C 信用证", "平台担保交易", "D/P 付款交单", "预付款+尾款"];

/** 期望供应商资质（多选） */
export const SUPPLIER_REQ_OPTIONS = [
  "有出口经验", "成立 3 年以上", "工厂直供", "已注册 UNGM", "支持小批量试单", "支持第三方验厂",
];

/** 目标国家（zh 展示 / en 供 CountryFlag 匹配） */
export const TARGET_COUNTRIES: { zh: string; en: string }[] = [
  { zh: "德国", en: "Germany" },
  { zh: "沙特阿拉伯", en: "Saudi Arabia" },
  { zh: "阿联酋", en: "United Arab Emirates" },
  { zh: "肯尼亚", en: "Kenya" },
  { zh: "尼日利亚", en: "Nigeria" },
  { zh: "南非", en: "South Africa" },
  { zh: "印度尼西亚", en: "Indonesia" },
  { zh: "印度", en: "India" },
  { zh: "越南", en: "Vietnam" },
  { zh: "巴西", en: "Brazil" },
  { zh: "英国", en: "United Kingdom" },
  { zh: "美国", en: "United States" },
];

/** 类目 → 规格参数名预置（二级类目命中时预填首行） */
export const SPEC_PRESETS: Record<string, string[]> = {
  光伏组件: ["功率(W)", "尺寸(mm)", "转换效率"],
  医疗耗材: ["型号", "灭菌方式", "注册证号"],
  医疗设备: ["型号", "技术参数", "注册证号"],
  储能设备: ["容量(kWh)", "电压(V)", "循环寿命"],
  工程机械整机: ["型号", "吨位/功率", "排放标准"],
  基础化工原料: ["纯度", "包装规格", "执行标准"],
};

/** 表单默认值（草稿恢复与重置共用） */
export const DEFAULT_RFQ_FORM: RfqFormState = {
  title: "",
  categoryL1: "",
  categoryL2: "",
  purchaseType: "once",
  description: "",
  quantity: "",
  unit: "件",
  specs: [{ name: "", value: "" }],
  certs: [],
  attachments: [],
  needSample: false,
  budgetMin: "",
  budgetMax: "",
  currency: "USD",
  budgetConfidential: false,
  countries: [],
  incoterm: "",
  destination: "",
  deliveryTime: "",
  paymentTerms: [],
  deadline: "",
  supplierReqs: [],
  visibility: "public",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  agreed: false,
};

/** 需求广场 Mock 数据（P1 替换为 fetchRfqList） */
export const PLAZA_RFQS: PlazaRfq[] = [
  { id: 1, industry: "新能源", tag: "能源/光伏", title: "光伏组件采购（10MW，框架协议）", countryZh: "德国", countryEn: "Germany", budgetDisplay: "预算保密", budgetUsd: 0, deadline: "2026-09-14", responses: 12, boosted: true },
  { id: 2, industry: "医疗健康", tag: "医疗/设备", title: "县级医院医疗设备询价", countryZh: "沙特阿拉伯", countryEn: "Saudi Arabia", budgetDisplay: "USD 40–60 万", budgetUsd: 50, deadline: "2026-09-12", responses: 18 },
  { id: 3, industry: "工程机械", tag: "机械/工程", title: "矿山工程机械需求（含配件）", countryZh: "肯尼亚", countryEn: "Kenya", budgetDisplay: "USD 25–35 万", budgetUsd: 30, deadline: "2026-09-20", responses: 9 },
  { id: 4, industry: "化工原料", tag: "化工/原料", title: "基础化工原料长期供货采购", countryZh: "印度尼西亚", countryEn: "Indonesia", budgetDisplay: "USD 80–120 万", budgetUsd: 100, deadline: "2026-09-25", responses: 15, boosted: true },
  { id: 5, industry: "农业食品", tag: "农业/食品", title: "食品加工设备整机采购", countryZh: "尼日利亚", countryEn: "Nigeria", budgetDisplay: "USD 15–25 万", budgetUsd: 20, deadline: "2026-09-18", responses: 6 },
  { id: 6, industry: "信息技术", tag: "IT/设备", title: "政务云计算机设备批量采购", countryZh: "阿联酋", countryEn: "United Arab Emirates", budgetDisplay: "USD 200–300 万", budgetUsd: 250, deadline: "2026-09-30", responses: 21 },
  { id: 7, industry: "教育设备", tag: "教育/设备", title: "职业技术学院实训设备采购", countryZh: "南非", countryEn: "South Africa", budgetDisplay: "USD 30–45 万", budgetUsd: 38, deadline: "2026-09-16", responses: 11 },
  { id: 8, industry: "医疗健康", tag: "医疗/耗材", title: "医疗耗材年度框架采购", countryZh: "肯尼亚", countryEn: "Kenya", budgetDisplay: "USD 10–20 万", budgetUsd: 15, deadline: "2026-09-11", responses: 8 },
];
