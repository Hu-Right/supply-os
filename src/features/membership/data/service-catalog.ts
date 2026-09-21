/**
 * 增值服务目录（报价表 V2「三~十」大类 + 企业版留资项，非自助订阅套餐）
 * Service catalog — 报价表《云境产品服务权益报价表_260921_V2》中**不走支付**的服务型 SKU
 *
 * @module features/membership/data/service-catalog
 * @description 会员套餐（free + 129/999/1299/8800）来自数据库 crm_membership_plans；
 *              本目录承载报价表里**人工/定制/合同为准**的服务项，前端只作品类展示 + 留资（扫码联系顾问），
 *              不产生订单。文案严格照报价表原文；暂以中文字面（与会员页既有中文风格一致，六语本地化留专轮）。
 *              group：enterprise=企业版留资项（随企业会员 Tab 展示）；services=第三~十大类（增值服务 Tab）。
 */

export type ServiceGroup = "enterprise" | "services";

export interface ServiceCatalogItem {
  id: string;
  group: ServiceGroup;
  /** 板块（如"专家顾问"） */
  category: string;
  /** 服务名称 */
  name: string;
  /** 价格（报价表原文，含"按需报价/定制报价"等非固定价） */
  price: string;
  /** 额度/服务方式 */
  mode: string;
  /** 核心权益（逐条） */
  benefits: string[];
}

export const SERVICE_CATALOG: ServiceCatalogItem[] = [
  // ── 二、企业版：随企业会员 Tab 展示的留资项 ──
  {
    id: "enterprise_1v1_match",
    group: "enterprise",
    category: "企业版",
    name: "单条 1对1 人工匹配",
    price: "¥199/单",
    mode: "1对1 匹配订单",
    benefits: ["1对1 人工匹配订单", "升级年包可全额抵扣本单"],
  },

  // ── 三、专家顾问咨询年包 ──
  {
    id: "consult_1v1",
    group: "services",
    category: "专家顾问",
    name: "1对1 专家咨询年包",
    price: "¥16,800/年",
    mode: "不限额度（顾问咨询）",
    benefits: ["1对1 专家咨询服务", "采购方平台规则咨询", "订单判断、资质合规、投标避坑等顾问服务"],
  },
  {
    id: "consult_strategy",
    group: "services",
    category: "专家顾问",
    name: "1对1 战略顾问服务",
    price: "¥36,800/年",
    mode: "全年战略服务",
    benefits: ["1对1 战略顾问服务", "企业国别市场采购机会诊断", "按国别（2 个国家）行业市场分析", "出具解决方案报告，辅助战略决策"],
  },
  {
    id: "consult_fullprocess",
    group: "services",
    category: "专家顾问",
    name: "专家全程陪跑（单项目）",
    price: "¥26,800 起/单",
    mode: "单项目全流程",
    benefits: ["1对1 专家全程陪跑", "辅助投标全流程：选单、标书、合规、报价、谈判全程带"],
  },

  // ── 四、增值服务 ──
  {
    id: "value_bid_report",
    group: "services",
    category: "增值服务",
    name: "投标辅助·标讯深度拆解报告",
    price: "¥500 ~ 3,000/单",
    mode: "按单",
    benefits: ["原始标讯文档拆解报告", "投标解析报告 + 投标指南", "类似案例分析 + 业主分析"],
  },

  // ── 五、央国企/大型企业定制服务 ──
  {
    id: "custom_research",
    group: "services",
    category: "定制调研",
    name: "定制服务市场调研",
    price: "¥1,280 起/1 个方向",
    mode: "不限额度",
    benefits: ["按选择方向定制服务，出具市场调研分析报告", "可选：国别、区域、竞争对手、发标方业主调研、成功案例分析、废标分析诊断、报价评测等（可多选）"],
  },

  // ── 六、AI 辅助写标书 ──
  {
    id: "ai_bid_doc",
    group: "services",
    category: "AI 工具",
    name: "AI 辅助写标书",
    price: "按 token 用量计费",
    mode: "按实际使用",
    benefits: ["自主选择大模型（Kimi / DeepSeek / ChatGPT / Gemini）", "按消耗 token 计费，用多少付多少"],
  },

  // ── 七、辅助商务谈判 ──
  {
    id: "negotiation",
    group: "services",
    category: "谈判服务",
    name: "辅助商务谈判",
    price: "按需报价（差旅费另计）",
    mode: "按次 / 按项目",
    benefits: ["专业顾问辅助商务谈判", "报价策略、条款谈判支持", "从业主采购方（平台规则）视角辅助谈判"],
  },

  // ── 八、KA 客户服务 ──
  {
    id: "ka_custom",
    group: "services",
    category: "KA 服务",
    name: "KA 大客户定制服务",
    price: "前置费：标的额 0.3%~1%，中标后提成 3%~10%",
    mode: "不限额度",
    benefits: ["合规服务 + 国际合规顾问，缩短合规时间", "投标全链路服务（一站式）"],
  },

  // ── 九、国际合规指导 ──
  {
    id: "compliance_single",
    group: "services",
    category: "合规服务",
    name: "按单合规指导",
    price: "¥880/单",
    mode: "按单",
    benefits: ["辅导准备合规材料", "合规路径推荐", "帮助企业缩短时间，高效完成合规、快速进入投标"],
  },
  {
    id: "compliance_annual",
    group: "services",
    category: "合规服务",
    name: "企业全流程合规指导（年度打包）",
    price: "定制报价",
    mode: "按公司",
    benefits: ["企业参与国际采购的全流程合规指导"],
  },

  // ── 十、API 对接 ──
  {
    id: "api_data",
    group: "services",
    category: "数据服务",
    name: "API 数据接口服务",
    price: "定制报价",
    mode: "按接口包",
    benefits: ["按国家、行业、海关数据接口打包提供", "相似机会推荐接口，可对接企业 CRM/ERP", "根据企业需求内容报价"],
  },
];
