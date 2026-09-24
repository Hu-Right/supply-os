/**
 * 供应商投标能力诊断 v2 —— 维度、题目与算分映射的唯一事实源
 * Supplier Bid-Capability Diagnosis v2 — dimension / question / scoring SSOT
 *
 * @module shared/constants/diagnosis-dimensions
 * @description 口径来自 docs/superpowers/specs/2026-09-24-供应商诊断表统一规范设计.md
 *              §4.1（题面与选项）与 §8.4（算分规则）。三条不可违反的规范在这里落地：
 *              N3 一个字段只服务一个维度（禁止跨维度复用）；
 *              选项顺序即得分档，映射逐题显式声明，不留默认值与「未选即最高」路径；
 *              选项中文原文入库（与 v1 一致），题面标签走 i18n 键，选项值不入 i18n。
 *              写入与比较一律引用本文件常量，禁止在别处出现裸字符串。
 */

export type DiagnosisFieldKind = "single" | "multi" | "text";

/** 计项分档：命中 min 及以上取该项 score（bands 必须按 min 降序或升序一致声明） */
export interface DiagnosisBand {
  min: number;
  score: number;
}

export interface DiagnosisFieldDef {
  /** 前端表单字段名 = 数据库列名（snake_case，一一对应） */
  key: string;
  column: string;
  /** 归属维度号；0 = 不参与评分的意向标记 */
  dimensionNo: number;
  kind: DiagnosisFieldKind;
  /** i18n 题面键前缀，见 locales 各语 procurement.json 的 diagQ 系列键 */
  labelKey: string;
  /** 中文题面：服务端生成 PDF 报告时无 i18n 上下文，直接用本字段（页面渲染仍走 labelKey） */
  labelZh: string;
  /** single / multi 必填：由低到高有序 */
  options?: readonly string[];
  /** single 必填：与 options 等长，值域 0-5 */
  scoreMap?: readonly number[];
  /** multi / text 必填：按计入项数分档 */
  bands?: readonly DiagnosisBand[];
}

export interface DiagnosisDimensionDef {
  no: number;
  name: string;
  nameEn: string;
  weight: number;
  /** 该维度独占的字段；同一字段不得出现在两个维度 */
  fields: readonly string[];
}

// ── 10 个评估维度（权重合计 100，沿用官方就绪度评分表维度名） ──

export const DIAGNOSIS_DIMENSIONS: readonly DiagnosisDimensionDef[] = [
  { no: 1, name: "国际供应商档案就绪度", nameEn: "International vendor profile readiness", weight: 10, fields: [] },
  { no: 2, name: "英文证据库可调用性", nameEn: "English evidence library usability", weight: 10, fields: ["english_evidence_level", "english_meeting_capability"] },
  { no: 3, name: "标书拆解与投标决策能力", nameEn: "Tender decoding and bid-decision capability", weight: 10, fields: ["tender_experience", "tender_amount_band", "procurement_frameworks"] },
  { no: 4, name: "强制文件控制能力", nameEn: "Mandatory-document control", weight: 10, fields: ["mandatory_docs"] },
  { no: 5, name: "合规治理与风险升级机制", nameEn: "Compliance governance and escalation", weight: 10, fields: ["ungm_status", "compliance_governance"] },
  { no: 6, name: "技术响应与方案证明能力", nameEn: "Technical response and evidence capability", weight: 15, fields: ["technical_response"] },
  { no: 7, name: "完整成本与报价决策能力", nameEn: "Full-cost pricing and bid-decision capability", weight: 15, fields: ["cost_pricing", "incoterms_capability", "payment_terms", "export_scale"] },
  { no: 8, name: "最终审核与提交控制能力", nameEn: "Final review and submission control", weight: 10, fields: ["submission_control"] },
  { no: 9, name: "履约组织与服务保障能力", nameEn: "Delivery organization and service assurance", weight: 5, fields: ["deliver_to_site", "service_countries", "overseas_companies"] },
  { no: 10, name: "投标团队、语言与CRM执行纪律", nameEn: "Bid team, language and CRM execution discipline", weight: 5, fields: ["team_discipline"] },
];

// ── 19 题答案字段（14 单选 + 2 多选 + 2 文本 + 1 意向标记） ──

export const DIAGNOSIS_FIELDS: readonly DiagnosisFieldDef[] = [
  // D2 英文证据库
  {
    key: "english_evidence_level", column: "english_evidence_level", dimensionNo: 2, kind: "single",
    labelKey: "diagQEnglishEvidenceLevel",
    labelZh: "目前能即时提供的英文投标资料到什么程度？",
    options: ["无英文资料", "仅英文产品页与目录", "有英文检测报告或业绩证明", "上述齐全且有英文标书素材", "全套齐备且有可引用案例库"],
    scoreMap: [0, 1, 3, 4, 5],
  },
  {
    key: "english_meeting_capability", column: "english_meeting_capability", dimensionNo: 2, kind: "single",
    labelKey: "diagQEnglishMeetingCapability",
    labelZh: "能否用英文独立参加供应商答疑会 / 视频澄清会？",
    options: ["需全程翻译陪同", "仅书面往来", "可邮件与表单独立答疑", "可独立参与视频澄清会"],
    scoreMap: [0, 2, 4, 5],
  },
  // D3 标书拆解与投标决策
  {
    key: "tender_experience", column: "tender_experience", dimensionNo: 3, kind: "single",
    labelKey: "diagQTenderExperience",
    labelZh: "近 24 个月参与国际公共采购投标的实际情况？",
    options: ["从未参与国际公采投标", "参与过但未通过资格预审", "通过资审但未入围", "入围但未中标", "有中标记录"],
    scoreMap: [0, 2, 3, 4, 5],
  },
  {
    key: "tender_amount_band", column: "tender_amount_band", dimensionNo: 3, kind: "single",
    labelKey: "diagQTenderAmountBand",
    labelZh: "最近一次投标的金额量级？",
    options: ["未参与", "10万美元以下", "10万至50万美元", "50万至200万美元", "200万美元以上"],
    scoreMap: [0, 2, 3, 4, 5],
  },
  {
    key: "procurement_frameworks", column: "procurement_frameworks", dimensionNo: 3, kind: "multi",
    labelKey: "diagQProcurementFrameworks",
    labelZh: "熟悉哪套采购文件体系？（可多选）",
    options: ["UNGM 联合国采购门户", "世界银行 GPF", "欧盟 TED", "联合国机构直接采购", "其他政府援建项目"],
    bands: [{ min: 0, score: 0 }, { min: 1, score: 2 }, { min: 2, score: 3 }, { min: 3, score: 4 }, { min: 4, score: 5 }],
  },
  // D4 强制文件控制
  {
    key: "mandatory_docs", column: "mandatory_docs", dimensionNo: 4, kind: "multi",
    labelKey: "diagQMandatoryDocs",
    labelZh: "以下强制文件你能即时提供哪些？（可多选）",
    options: ["营业执照英文版", "ISO体系证书", "第三方检测报告", "原产地证", "已交付业绩证明", "无商业犯罪声明", "银行资信证明", "童工与环保声明"],
    bands: [{ min: 0, score: 0 }, { min: 1, score: 2 }, { min: 3, score: 3 }, { min: 5, score: 4 }, { min: 7, score: 5 }],
  },
  // D5 合规治理与风险升级
  {
    key: "ungm_status", column: "ungm_status", dimensionNo: 5, kind: "single",
    labelKey: "diagQUngmStatus",
    labelZh: "UNGM（联合国全球采购门户）注册状态？",
    options: ["未注册", "已注册基础级(Basic)", "已注册一级(Level 1)", "已注册二级(Level 2)"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "compliance_governance", column: "compliance_governance", dimensionNo: 5, kind: "single",
    labelKey: "diagQComplianceGovernance",
    labelZh: "是否有合规专岗与整改机制？",
    options: ["无", "有制度无专岗", "有专岗", "有专岗且年度审计"],
    scoreMap: [0, 2, 4, 5],
  },
  // D6 技术响应与方案证明
  {
    key: "technical_response", column: "technical_response", dimensionNo: 6, kind: "single",
    labelKey: "diagQTechnicalResponse",
    labelZh: "能否按标书逐条出技术响应表并附证明？",
    options: ["不能逐条应答", "仅销售口头应答", "有技术团队可逐条应答", "有专用响应模板与案例库", "有3个以上政府或国际组织已交付案例"],
    scoreMap: [0, 1, 3, 4, 5],
  },
  // D7 完整成本与报价决策
  {
    key: "cost_pricing", column: "cost_pricing", dimensionNo: 7, kind: "single",
    labelKey: "diagQCostPricing",
    labelZh: "报价时成本如何核算？",
    options: ["凭经验估算", "有内部成本表", "含汇率物流与账期资金成本", "有专职报价岗并复核"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "incoterms_capability", column: "incoterms_capability", dimensionNo: 7, kind: "single",
    labelKey: "diagQIncotermsCapability",
    labelZh: "多贸易条款（FOB/CIF/DDP）报价能力？",
    options: ["只会FOB", "会FOB与CIF", "三种贸易条款都会", "三种都会且能报目的国清关与内陆运输"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "payment_terms", column: "payment_terms", dimensionNo: 7, kind: "single",
    labelKey: "diagQPaymentTerms",
    labelZh: "是否接受 30 天以上国际账期？",
    options: ["不可以", "可以"],
    scoreMap: [1, 5],
  },
  {
    key: "export_scale", column: "export_scale", dimensionNo: 7, kind: "single",
    labelKey: "diagQExportScale",
    labelZh: "近 2 年出口 / 国际业务规模？",
    options: ["尚未出口", "500万美元以下", "500-2000万美元", "2000万美元以上"],
    scoreMap: [1, 2, 4, 5],
  },
  // D8 最终审核与提交控制
  {
    key: "submission_control", column: "submission_control", dimensionNo: 8, kind: "single",
    labelKey: "diagQSubmissionControl",
    labelZh: "标书提交前的复核流程？",
    options: ["无人复核", "编制人自审", "双人复核", "授权签字且用提交检查单"],
    scoreMap: [0, 2, 4, 5],
  },
  // D9 履约组织与服务保障
  {
    key: "deliver_to_site", column: "deliver_to_site", dimensionNo: 9, kind: "single",
    labelKey: "diagQDeliverToSite",
    labelZh: "能否交付至项目现场国？",
    options: ["不可", "经第三国", "可直接发货至项目国", "可发货且有本地代理"],
    scoreMap: [0, 2, 4, 5],
  },
  {
    key: "service_countries", column: "service_countries", dimensionNo: 9, kind: "text",
    labelKey: "diagQServiceCountries",
    labelZh: "有售后点 / 服务站 / 维修点的国家（逗号分隔）",
    bands: [{ min: 0, score: 0 }, { min: 1, score: 1 }, { min: 3, score: 3 }, { min: 5, score: 5 }],
  },
  {
    key: "overseas_companies", column: "overseas_companies", dimensionNo: 9, kind: "text",
    labelKey: "diagQOverseasCompanies",
    labelZh: "有海外分公司 / 投资公司的国家（逗号分隔）",
    bands: [{ min: 0, score: 0 }, { min: 1, score: 2 }, { min: 2, score: 4 }, { min: 3, score: 5 }],
  },
  // D10 投标团队与执行纪律
  {
    key: "team_discipline", column: "team_discipline", dimensionNo: 10, kind: "single",
    labelKey: "diagQTeamDiscipline",
    labelZh: "投标团队人数与台账情况？",
    options: ["无专人", "1人且无台账", "1至2人有台账", "3人以上有台账"],
    scoreMap: [0, 2, 4, 5],
  },
  // 意向标记：dimensionNo 0，不参与任何维度计分（spec A9）
  {
    key: "bid_willingness", column: "bid_willingness", dimensionNo: 0, kind: "single",
    labelKey: "diagQBidWillingness",
    labelZh: "是否愿意参与联合国及政府采购投标？",
    options: ["否", "是"],
    scoreMap: [0, 0],
  },
];

export const DIAGNOSIS_FIELD_MAP: Readonly<Record<string, DiagnosisFieldDef>> = Object.fromEntries(
  DIAGNOSIS_FIELDS.map((f) => [f.key, f]),
);

/** 评分用字段（排除 dimensionNo=0 的意向标记） */
export const DIAGNOSIS_SCORED_FIELDS: readonly DiagnosisFieldDef[] = DIAGNOSIS_FIELDS.filter(
  (f) => f.dimensionNo !== 0,
);

/** 最低档答案常量：D3 硬门槛判定用（spec §8.4） */
export const TENDER_EXPERIENCE_NONE = DIAGNOSIS_FIELD_MAP["tender_experience"].options![0];

/** 逗号/顿号/分号/空白分隔计数，与 v1 countCommaItems 同语义 */
export function countDiagnosisItems(value: string): number {
  if (!value || !value.trim()) return 0;
  return value.split(/[,，;；、\s]+/).filter((x) => x.trim().length > 0).length;
}

/** 按 bands 取分档分（bands 内 min 升序；取满足 min 的最大档） */
export function scoreByBands(bands: readonly DiagnosisBand[], count: number): number {
  const ordered = [...bands].sort((a, b) => a.min - b.min);
  let score = ordered[0]?.score ?? 0;
  for (const band of ordered) if (count >= band.min) score = band.score;
  return score;
}

/** 单字段原始分 0-5：single 查 scoreMap，multi 计入选项，text 计项 */
export function scoreDiagnosisField(field: DiagnosisFieldDef, value: string | string[]): number {
  const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
  if (empty) {
    // 空值一律落最低档：单选最低档分值、多选/文本 0 项分档
    if (field.kind === "single") return field.scoreMap![0];
    return scoreByBands(field.bands!, 0);
  }
  if (field.kind === "single") {
    const idx = field.options!.indexOf(String(value));
    if (idx < 0) throw new Error(`Diagnosis option out of range: ${field.key}=${String(value)}`);
    return field.scoreMap![idx];
  }
  if (field.kind === "multi") {
    const picked = Array.isArray(value) ? value : String(value).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const invalid = picked.filter((p) => !field.options!.includes(p));
    if (invalid.length) throw new Error(`Diagnosis option out of range: ${field.key} has ${invalid.join("/")}`);
    return scoreByBands(field.bands!, picked.length);
  }
  return scoreByBands(field.bands!, countDiagnosisItems(String(value)));
}

/**
 * 按表别名拼诊断列选择片段。列名全部来自本文件 SSOT，不接受任何外部输入。
 * 存在这里而不是各处手抄，是因为 AI 画像取数与供应商资源库候选取数**必须同口径**：
 * 两处列清单一旦漂移，候选工厂会比自家企业多（或少）几个字段，LLM 评分直接不可比。
 */
export function diagnosisColumnSelect(alias: string): string {
  return DIAGNOSIS_FIELDS.map((f) => `${alias}.${f.column}`).join(", ");
}

/** 诊断列名清单（与 DIAGNOSIS_FIELDS 同序）：供取数与完整度判定复用 */
export const DIAGNOSIS_COLUMNS: readonly string[] = DIAGNOSIS_FIELDS.map((f) => f.column);

/**
 * 结构闭合自检：钉住绝对值（权重 100、字段 19）+ 内部一致性，防「只做自比基线」的假门禁。
 * 由单元测试调用；生产代码不重复执行。
 */
export function assertDiagnosisDimensionsIntact(): void {
  const weightSum = DIAGNOSIS_DIMENSIONS.reduce((s, d) => s + d.weight, 0);
  if (weightSum !== 100) throw new Error(`DIAGNOSIS weight sum ${weightSum} !== 100`);
  if (DIAGNOSIS_FIELDS.length !== 19) throw new Error(`DIAGNOSIS_FIELDS count ${DIAGNOSIS_FIELDS.length} !== 19`);

  const claimed = new Set<string>();
  for (const dim of DIAGNOSIS_DIMENSIONS) {
    for (const key of dim.fields) {
      if (claimed.has(key)) throw new Error(`Field ${key} claimed by two dimensions (violates N3)`);
      claimed.add(key);
      const field = DIAGNOSIS_FIELD_MAP[key];
      if (!field) throw new Error(`Dimension ${dim.no} references unknown field ${key}`);
      if (field.dimensionNo !== dim.no) throw new Error(`Field ${key} dimensionNo ${field.dimensionNo} mismatches dim ${dim.no}`);
    }
    if (dim.no !== 1 && dim.fields.length === 0) throw new Error(`Dimension ${dim.no} has no direct field`);
  }

  for (const field of DIAGNOSIS_FIELDS) {
    if (field.kind === "single") {
      if (!field.options?.length || !field.scoreMap?.length) throw new Error(`${field.key}: single needs options + scoreMap`);
      if (field.options.length !== field.scoreMap.length) throw new Error(`${field.key}: options/scoreMap length mismatch`);
      if (field.dimensionNo !== 0 && field.scoreMap.some((s) => s < 0 || s > 5)) throw new Error(`${field.key}: score out of 0-5`);
    } else if (!field.bands?.length) {
      throw new Error(`${field.key}: ${field.kind} needs bands`);
    }
    if (field.column !== field.key) throw new Error(`${field.key}: column must equal key`);
  }

  if (DIAGNOSIS_FIELD_MAP["bid_willingness"].dimensionNo !== 0) throw new Error("bid_willingness must not be scored");
  if (claimed.has("bid_willingness")) throw new Error("bid_willingness must not belong to any dimension");
}
