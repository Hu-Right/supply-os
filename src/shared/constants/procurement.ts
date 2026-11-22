/**
 * 采购需求发布域常量（整体替换旧 RFQ v2，2026-11-14 拍板）
 * @module shared/constants/procurement
 *
 * @description 七步发布流程与全案 P1 的权威口径：状态机/枚举/转移表集中于此，
 *              服务层（src/lib/services/procurement）与前端共用。旧 rfq-demand.ts
 *              七态随域退役，不复用。
 */

// ── 采购项目状态机 ────────────────────────────────────────────────────────────

export const PROJECT_STATUS = {
  DRAFT: "draft", // 草稿（可编辑）
  SUBMITTED: "submitted", // 已提交=确认最终版本（流程第3步完成），待核验
  NEED_INFO: "need_info", // 待补充材料（云境核验后要求补充）
  UNDER_REVIEW: "under_review", // 核验中
  PUBLISHED: "published", // 已发布（流程第7步），启动供应商匹配
  CLOSED: "closed", // 终态：关闭/撤回/到期
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

/** closed 细分原因 */
export const PROJECT_CLOSE_REASON = {
  CANCELLED: "cancelled", // 采购方取消
  WITHDRAWN: "withdrawn", // 采购方撤回（授权书第五条：书面要求停止发布）
  EXPIRED: "expired", // 截标/交期过期
  AWARDED: "awarded", // 已定标结案（P0 新增）
  SHORTLISTED: "shortlisted", // EOI 已形成短名单结案（P1a 新增；后续按 prequalified 另起正式采购）
} as const;

/** 可发布状态：核验与授权闸口的判定基准 */
export const PUBLISHABLE_STATUSES: readonly string[] = [
  PROJECT_STATUS.SUBMITTED,
  PROJECT_STATUS.UNDER_REVIEW,
];

// ── 采购方主体 ────────────────────────────────────────────────────────────────

export const BUYER_STATUS = {
  PENDING: "pending", // 待审核
  VERIFIED: "verified", // 已认证
  NEED_INFO: "need_info", // 需补充材料
  RESTRICTED: "restricted", // 限制使用
} as const;

export const BUYER_ORG_TYPES = [
  "government", // 政府
  "international_org", // 国际组织
  "ngo", // NGO
  "state_owned", // 国有企业
  "private", // 私人企业
  "trader", // 贸易商
  "epc", // EPC 承包商
  "agent", // 采购代理
] as const;

export const BUYER_ROLES = [
  "end_buyer", // 最终采购方
  "authorized_agent", // 采购方授权代理
  "general_contractor", // 总承包商
  "intermediary", // 中间采购商
] as const;

// ── 需求填报枚举（F02）───────────────────────────────────────────────────────

export const PROJECT_PURPOSE = {
  REAL: "real", // 真实采购
  BUDGETING: "budgeting", // 预算阶段采购
  RESEARCH: "research", // 市场调研
  FUTURE_PLAN: "future_plan", // 未来采购计划
} as const;

export const OBJECT_TYPES = ["goods", "engineering", "service", "solution"] as const;


export const INSTALL_NEEDS = ["installation", "commissioning", "training"] as const;

// ── 核验（F04/F05/F06）───────────────────────────────────────────────────────

export const REVIEW_STAGE = {
  AUTO: "auto", // 系统自动初审（九项检查）
  IDENTITY: "identity", // 采购方身份及授权审核
  REQUIREMENT: "requirement", // 需求真实性核验
  FEASIBILITY: "feasibility", // 技术可招标性审核
  AUTHORIZATION: "authorization", // 授权书核验
  FUND: "fund", // 资金核验
} as const;

export const REVIEW_RESULT = {
  PASS: "pass",
  NEED_INFO: "need_info",
  RISK: "risk", // 存在较高风险，暂停进入发布流程
  REJECT: "reject",
} as const;

/** 系统自动初审的核验主体标识 */
export const AUTO_REVIEWER = "system:auto-engine";

// ── 授权书 / 发布 / 匹配 ─────────────────────────────────────────────────────

export const AUTHORIZATION_STATUS = {
  PENDING: "pending", // 已签署待云境核验
  VERIFIED: "verified", // 核验通过（发布前置）
  REJECTED: "rejected", // 核验未通过
} as const;

export const TENDER_PUBLISH_MODE = {
  PUBLIC: "public", // 公开招标
  TARGETED: "targeted", // 定向邀请
  PREQUALIFIED: "prequalified", // 预资格/EOI 后邀请
} as const;

export const MATCH_STATUS = {
  RECOMMENDED: "recommended", // 系统推荐
  INVITED: "invited", // 已邀约
} as const;

/** 采购方式（P2 方式判定引擎留置；MVP 恒 RFQ） */
export const PROCUREMENT_MODE = { RFQ: "rfq" } as const;

// ── RFQ 闭环（P0）：方式 / 标讯 / 响应 / 定标 ─────────────────────────────────

/** 采购方式。P0 仅 RFQ 生效；其余取值已落列，等 P1+ 逐步开放 */
export const PROCUREMENT_METHOD = {
  RFQ: "rfq", // 询价（合格最低价）
  ITB: "itb", // 正式招标
  RFP: "rfp", // 方案征集
  EOI: "eoi", // 供应商征集（产出短名单）
  LTA: "lta", // 长期协议
} as const;

export type ProcurementMethod = (typeof PROCUREMENT_METHOD)[keyof typeof PROCUREMENT_METHOD];

/**
 * 当前开放可用的采购方式（发布向导选择器 + 服务端写入校验的唯一口径）。
 * P1b 放开 RFP（双信封 + 综合评分）；ITB 随 P1c（需配套投标文件包 F14 与答疑期）；
 * LTA 为合同模式，P2 随 F19 立项。
 */
export const PROCUREMENT_METHOD_AVAILABLE: readonly string[] = [
  PROCUREMENT_METHOD.RFQ,
  PROCUREMENT_METHOD.EOI,
  PROCUREMENT_METHOD.RFP,
];

/** 响应文件信封取值（procurement_response_files.envelope 值域口径） */
export const RESPONSE_ENVELOPE = {
  TECHNICAL: "technical", // 技术标（RFP 方案文档 / ITB 投标文件）
  FINANCIAL: "financial", // 商务标（报价文件）
  COMMERCIAL: "commercial", // 商务条款（预留）
} as const;

/** 评分模板（eval_template JSON 快照）形状：维度×权重×技术门槛线，发布时冻结 */
export interface EvalTemplate {
  /** 评分维度：键/名称/权重；权重合计须等于 technicalMax（70/30 口径即 70） */
  dimensions: Array<{ key: string; label: string; weight: number }>;
  /** 技术部分满分（70/30 口径=70；总分=technicalMax+30） */
  technicalMax?: number;
  /** 技术最低门槛分（0~technicalMax；未达标不进商务评分、商务标不开封） */
  technicalThreshold: number;
}

/** 70/30 预设模板（《全案》F11：技术 70 分 + 财务 30 分公式 P_i=30×P_min/P_i） */
export const EVAL_TEMPLATE_PRESET_70_30: EvalTemplate = {
  dimensions: [
    { key: "corp_qualification", label: "企业资质信誉及组织能力", weight: 10 },
    { key: "track_record", label: "类似项目业绩和专业经验", weight: 15 },
    { key: "solution_fitness", label: "技术方案适用性与完整度", weight: 25 },
    { key: "plan_team", label: "实施计划和团队配置", weight: 10 },
    { key: "quality_risk", label: "质量控制及风险管理", weight: 5 },
    { key: "sustainability", label: "可持续发展承诺", weight: 5 },
  ],
  technicalMax: 70,
  technicalThreshold: 42,
};

/** 校验评分模板结构（发布闸用）：维度≥1、权重合计=technicalMax（缺省 70）、门槛线在其半开区间内 */
export function isValidEvalTemplate(t: unknown): t is EvalTemplate {
  if (t == null || typeof t !== "object") return false;
  const tpl = t as Partial<EvalTemplate>;
  if (!Array.isArray(tpl.dimensions) || tpl.dimensions.length === 0) return false;
  const technicalMax = Number(tpl.technicalMax ?? 70);
  if (!Number.isFinite(technicalMax) || technicalMax <= 0) return false;
  const weightSum = tpl.dimensions.reduce((acc, d) => acc + Number(d?.weight ?? 0), 0);
  if (Math.abs(weightSum - technicalMax) > 0.01) return false;
  const th = Number(tpl.technicalThreshold);
  return Number.isFinite(th) && th >= 0 && th < technicalMax;
}

/** 财务分满分（70/30 口径：技术 70 + 财务 30 = 100） */
export const FINANCIAL_SCORE_MAX = 30;

// ── 评标法 / 信封 / 密封（发布配置化：按方式生成，rfq 缺省 = P0 硬编码值）───────

/** 评标法（procurement_tenders.award_method 值域；P0 仅 lowest_price，P1a 增 eligibility_filter） */
export const AWARD_METHOD = {
  LOWEST_PRICE: "lowest_price", // 合格最低价（RFQ）
  LOWEST_EVALUATED: "lowest_evaluated", // 最低评审价（ITB，含价格修正，P1c）
  COMPREHENSIVE: "comprehensive", // 综合评分（RFP，70/30 模板，P1b）
  ELIGIBILITY_FILTER: "eligibility_filter", // 资格与能力筛选（EOI，不比价）
} as const;

/** 方式 → 缺省评标法（发布配置推导的唯一口径；LTA 取底层方式的映射） */
export const AWARD_METHOD_BY_METHOD: Record<string, string> = {
  [PROCUREMENT_METHOD.RFQ]: AWARD_METHOD.LOWEST_PRICE,
  [PROCUREMENT_METHOD.ITB]: AWARD_METHOD.LOWEST_EVALUATED,
  [PROCUREMENT_METHOD.RFP]: AWARD_METHOD.COMPREHENSIVE,
  [PROCUREMENT_METHOD.EOI]: AWARD_METHOD.ELIGIBILITY_FILTER,
};

/** 方式 → 是否密封报价（EOI 意向征集不密封：提交即采购方可见份数与内容） */
export const SEALED_BY_METHOD: Record<string, boolean> = {
  [PROCUREMENT_METHOD.RFQ]: true,
  [PROCUREMENT_METHOD.ITB]: true,
  [PROCUREMENT_METHOD.RFP]: true,
  [PROCUREMENT_METHOD.EOI]: false,
};

/** 标讯状态。列宽 16，禁止超长取值 */
export const TENDER_STATUS = {
  PUBLISHED: "published", // 已发布，接收响应
  CLOSED: "closed", // 已截止收标并开标
  AWARDED: "awarded", // 已定标
  CANCELLED: "cancelled", // 取消
} as const;

/** 供应商响应状态。列宽 16 */
export const RESPONSE_STATUS = {
  DRAFT: "draft", // 草稿（可改）
  SUBMITTED: "submitted", // 已提交（密封）
  WITHDRAWN: "withdrawn", // 截止前撤回
  DISQUALIFIED: "disqualified", // 资格不符
  EVALUATED: "evaluated", // 已评审（中标或已参与评审）
} as const;

/** 定标结果类型：P0/P1a 放开 award + shortlist；lta_holder 留给 P2 LTA */
export const AWARD_KIND = {
  AWARD: "award",
  SHORTLIST: "shortlist", // EOI 短名单（多行，一行一响应）
} as const;

/** 标讯状态转移表（服务层唯一写点校验） */
export const TENDER_TRANSITIONS: Record<string, readonly string[]> = {
  [TENDER_STATUS.PUBLISHED]: [TENDER_STATUS.CLOSED, TENDER_STATUS.CANCELLED],
  [TENDER_STATUS.CLOSED]: [TENDER_STATUS.AWARDED, TENDER_STATUS.CANCELLED],
  [TENDER_STATUS.AWARDED]: [],
  [TENDER_STATUS.CANCELLED]: [],
};

/** 响应状态转移表 */
export const RESPONSE_TRANSITIONS: Record<string, readonly string[]> = {
  [RESPONSE_STATUS.DRAFT]: [RESPONSE_STATUS.SUBMITTED, RESPONSE_STATUS.WITHDRAWN],
  [RESPONSE_STATUS.SUBMITTED]: [RESPONSE_STATUS.WITHDRAWN, RESPONSE_STATUS.DISQUALIFIED, RESPONSE_STATUS.EVALUATED],
  [RESPONSE_STATUS.WITHDRAWN]: [RESPONSE_STATUS.SUBMITTED],
  [RESPONSE_STATUS.DISQUALIFIED]: [],
  [RESPONSE_STATUS.EVALUATED]: [],
};

/** 截止后未定标的宽限天数：到期仍未定标 → 项目 closed/expired 并撤投影 */
export const AWARD_GRACE_DAYS = 30;

/** 回执编号前缀：OSRP-{年}-{6位id} */
export const RESPONSE_RECEIPT_PREFIX = "OSRP";

// ── 编号规则 ─────────────────────────────────────────────────────────────────

/** 采购需求编号前缀：OSPR-{年}-{6位id}（创建即生成，授权书/公告页共用） */
export const PROJECT_REF_PREFIX = "OSPR";
/** 正式发布编号前缀：OSPT-{年}-{6位id} */
export const TENDER_NO_PREFIX = "OSPT";

/** 状态机合法转移表：key=from, value=允许的 to 集合（含终态自环由调用方裁决） */
export const PROJECT_TRANSITIONS: Record<string, readonly string[]> = {
  [PROJECT_STATUS.DRAFT]: [
    PROJECT_STATUS.SUBMITTED,
    PROJECT_STATUS.CLOSED,
  ],
  [PROJECT_STATUS.SUBMITTED]: [
    PROJECT_STATUS.UNDER_REVIEW, // 云境领取核验
    PROJECT_STATUS.NEED_INFO, // 需补充材料
    PROJECT_STATUS.PUBLISHED, // 核验直接通过（快核）
    PROJECT_STATUS.DRAFT, // 撤回提交（仅未被领取时）
    PROJECT_STATUS.CLOSED,
  ],
  [PROJECT_STATUS.NEED_INFO]: [
    PROJECT_STATUS.SUBMITTED, // 补充后重新提交（版本+1）
    PROJECT_STATUS.CLOSED,
  ],
  [PROJECT_STATUS.UNDER_REVIEW]: [
    PROJECT_STATUS.PUBLISHED, // 核验通过
    PROJECT_STATUS.NEED_INFO,
    PROJECT_STATUS.CLOSED,
  ],
  [PROJECT_STATUS.PUBLISHED]: [
    PROJECT_STATUS.CLOSED, // 撤回/到期/取消
  ],
  [PROJECT_STATUS.CLOSED]: [], // 终态
};

// ── 公告体系投影状态（bid_notices.rfq_status 列的消费口径）────────────────────
// 注意：这是公告检索面（notice_public/宽表/Meili/首页）对平台行的可见性口径，
// 与 procurement_projects.status 状态机是两条数据线；'published' 由投影写入。

export const RFQ_STATUS = {
  PUBLISHED: "published",
  CLOSED: "closed",
} as const;
