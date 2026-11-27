/**
 * 诊断 V5 —— 投标资格闸门（A 段合格制）
 * Bid-eligibility gate for diagnosis V5
 *
 * @module shared/constants/diagnosis-bid-gate
 * @description 2026-11-27 口径：诊断表原来把「废标项」和「评分项」加总成一个 100 分，
 *              结果出现「78 分却进不了投标名单」。国际资格预审主体是 pass/fail：
 *              硬项缺一项即出局，其余项再高分也不改变结论。
 *
 *              本模块把结论拆成两个互不相加、互不换算的判断：
 *              1. `eligibility` —— 能不能进投标名单。只看 A 段硬门槛（rules），与总分无关；
 *              2. `competitiveness` —— 值不值得投。只看 B 段能力分（78/60 分档）。
 *
 *              规则只引用 `diagnosis-v5.ts` 已存在的字段与选项序号，不新增表单字段，
 *              因此不需要改数据库、不需要改发往后台的快照契约。
 *              纯函数：不读库、不读环境，前端可用来做填写中的实时预判
 *              （此时 `derived` 缺省为 0，只判表单可判的规则）。
 */
import {
  DIAGNOSIS_V5_FIELD_MAP,
  type DiagnosisV5FieldDef,
} from "./diagnosis-v5";

/** disqualify = 废标项（出局）；conditional = 可补项（补齐后可投） */
export type BidGateLevel = "disqualify" | "conditional";

/** 资格结论：出局 / 有条件 / 已具备 */
export type BidEligibility = "out" | "conditional" | "qualified";

/** 竞争力分档：达标 / 可投但偏弱 / 不建议投 */
export type BidCompetitiveness = "strong" | "viable" | "weak";

/** 证据等级：本闸门只承认第三方证明（L3）与可回访（L4） */
export type BidEvidenceLevel = "L3" | "L4";

export interface BidGateRule {
  id: string;
  level: BidGateLevel;
  /** 关联的 V5 字段 key（derived 规则也挂在触发它的字段上，便于定位题目） */
  fieldKey: string;
  /** 单选触发：选项序号 <= maxOptionIndex 即视为不满足 */
  maxOptionIndex?: number;
  /** 多选触发：一项都没选即视为不满足 */
  emptyMulti?: boolean;
  titleKey: string;
  titleZh: string;
  /** 具体缺口（写清「缺的是什么」，不是「分数低」） */
  gapZh: string;
  /** 整改动作 */
  remediationZh: string;
  /** 补齐所需天数；null = 取决于外部条件，无法估 */
  leadTimeDays: number | null;
  /** 该判定成立所需的证据等级 */
  evidenceLevel: BidEvidenceLevel;
}

/**
 * A 段硬门槛规则表。
 * 编号语义：G-<类别>-<序号>；类别对应 A 段的法定主体 / 财务 / 合规 / 质量 / HSE / 准入 / 本地化 / 证据。
 */
export const BID_GATE_RULES: readonly BidGateRule[] = [
  // ── 废标项：缺一项即出局，不看总分 ──
  {
    id: "G-EXP-01", level: "disqualify", fieldKey: "export_entity", maxOptionIndex: 0,
    titleKey: "bidGateRExportEntity", titleZh: "无出口主体资质",
    gapZh: "进出口经营权、海关备案、外汇名录、退税资格均不具备，无法签署外贸或对外承包合同。",
    remediationZh: "办理对外贸易经营者备案 → 海关进出口货物收发货人备案 → 外汇收支名录登记；三项可并行，约 30 天。",
    leadTimeDays: 30, evidenceLevel: "L3",
  },
  {
    id: "G-COMP-01", level: "disqualify", fieldKey: "compliance_governance", maxOptionIndex: 0,
    titleKey: "bidGateRCompliance", titleZh: "合规治理缺位",
    gapZh: "无合规制度、未做制裁名单筛查。被列入 OFAC/EU/UN 或世行 debarment 名单时全球范围出局且难补救。",
    remediationZh: "建立制裁与出口管制筛查流程 + 反腐败政策（FCPA/UKBA），由法人签署并留档；约 21 天。",
    leadTimeDays: 21, evidenceLevel: "L3",
  },
  {
    id: "G-QMS-01", level: "disqualify", fieldKey: "quality_system", maxOptionIndex: 1,
    titleKey: "bidGateRQualitySystem", titleZh: "无 ISO 9001 认证",
    gapZh: "仅内部检验制度、未取得 ISO 9001。多数政府采购与大型业主把 ISO 9001 列为资格性条款而非加分项。",
    remediationZh: "选择认证机构做 ISO 9001 初次认证（含文件编写、内审、认证审核）；约 90 天。",
    leadTimeDays: 90, evidenceLevel: "L3",
  },
  {
    id: "G-HSE-01", level: "disqualify", fieldKey: "hse_record", maxOptionIndex: 0,
    titleKey: "bidGateRHse", titleZh: "无 HSE 制度",
    gapZh: "无职业健康安全与环境管理制度。工程承包与现场作业类标的普遍一票否决，并要求近 3 年无重大事故声明。",
    remediationZh: "建立 HSE 制度并取得 ISO 45001（如投标工程类标的，同时准备近 3 年事故记录与保险凭证）；约 90 天。",
    leadTimeDays: 90, evidenceLevel: "L3",
  },
  {
    id: "G-LGL-03", level: "disqualify", fieldKey: "cert_coverage",
    titleKey: "bidGateRLegalMissing3", titleZh: "目标市场法定准入缺口 ≥ 3 项",
    gapZh: "所选目标市场的强制认证/注册缺口达到 3 项以上，该国别该品类事实上不具备投标资格。",
    remediationZh: "按诊断报告的逐市场准入清单，优先办理周期最短、覆盖品类最广的一项；缺口 ≥3 时建议先收缩到 1 个国别。",
    leadTimeDays: null, evidenceLevel: "L3",
  },
  // ── 可补项：补齐后可投，不否定主体资格 ──
  {
    id: "G-FIN-01", level: "conditional", fieldKey: "finance_credit", maxOptionIndex: 1,
    titleKey: "bidGateRFinance", titleZh: "无银行授信 / 保函能力",
    gapZh: "仅有审计报告，无银行授信或履约保函开立能力。中标后开不出保函等于弃标，且多数标书要求附银行资信证明。",
    remediationZh: "向开户行申请授信并取得保函开立意向书；无抵押时通常需要保证金或母公司担保。约 42 天。",
    leadTimeDays: 42, evidenceLevel: "L3",
  },
  {
    id: "G-LGL-01", level: "conditional", fieldKey: "cert_coverage",
    titleKey: "bidGateRLegalMissing1", titleZh: "存在目标市场法定准入缺口",
    gapZh: "所选目标市场有强制认证/注册尚未取得，该国别不可投，其余国别不受影响。",
    remediationZh: "按逐市场清单逐项办理，并把「认证周期 × 费用 × 责任人」写进投标计划。",
    leadTimeDays: null, evidenceLevel: "L3",
  },
  {
    id: "G-CHN-01", level: "conditional", fieldKey: "target_channels", emptyMulti: true,
    titleKey: "bidGateRChannels", titleZh: "未注册任何国际采购渠道",
    gapZh: "UNGM、SAM.gov、世行/亚行供应商库、各国电子采购平台均未注册，多数公开标连标书都拿不到。",
    remediationZh: "先注册 UNGM（免费、1–3 天）与 1 个目标国电子采购平台，取得供应商编号后再谈投标。约 14 天。",
    leadTimeDays: 14, evidenceLevel: "L3",
  },
  {
    id: "G-EVD-01", level: "conditional", fieldKey: "english_evidence_level", maxOptionIndex: 1,
    titleKey: "bidGateREvidence", titleZh: "无英文证据材料",
    gapZh: "只有英文产品页/目录，缺英文检测报告与业绩证明。国际评标先看文档，文档不足在初审即被过滤。",
    remediationZh: "把 3 个代表性项目的合同、验收单、检测报告做英文版并公证；约 45 天。",
    leadTimeDays: 45, evidenceLevel: "L3",
  },
  {
    id: "G-LOC-01", level: "conditional", fieldKey: "local_presence", maxOptionIndex: 0,
    titleZh: "目标市场无代理 / 实体",
    titleKey: "bidGateRLocal",
    gapZh: "目标市场既无代理也无实体/服务点。沙特、印尼、越南等多国对部分品类强制要求本地代理或注册主体。",
    remediationZh: "先签 1 家非排他代理（成本最低、可退出），同步评估是否需要在主要市场设实体。约 90 天。",
    leadTimeDays: 90, evidenceLevel: "L3",
  },
  {
    id: "G-SVC-01", level: "conditional", fieldKey: "service_sla", maxOptionIndex: 1,
    titleKey: "bidGateRService", titleZh: "售后无时限承诺",
    gapZh: "仅邮件/远程支持，无响应与到场时限承诺，无本地服务点与备件安排。",
    remediationZh: "与代理或第三方服务商签 SLA（响应 ≤48h、到场 ≤5 天），并在标书中如实引用。约 30 天。",
    leadTimeDays: 30, evidenceLevel: "L3",
  },
  {
    id: "G-TRK-01", level: "conditional", fieldKey: "overseas_record", maxOptionIndex: 1,
    titleKey: "bidGateRTrackRecord", titleZh: "无海外同类项目业绩",
    gapZh: "没有海外同类项目业绩（国内同类或海外非同类不算）。部分业主把「近 24 个月同类项目业绩」写进资格条款，业绩为空时连入围都过不去，技术分再高也没用。",
    remediationZh: "先做 1–2 个可举证的海外项目（分包、代理交付、联合体都算），或改投不设业绩门槛的标；有国内同类项目时可先按「同类技术场景」写进标书。",
    leadTimeDays: null, evidenceLevel: "L3",
  },
  {
    id: "G-EVD-02", level: "conditional", fieldKey: "record_evidence", maxOptionIndex: 0,
    titleKey: "bidGateRRecordEvidence", titleZh: "业绩拿不出证明",
    gapZh: "说得出项目，但拿不出合同或验收单。评标阶段业绩要核原件，只有自述的业绩在资格审查里等于零。",
    remediationZh: "把已有项目的合同、验收单、业主证明调出来做英文版并公证；从现在起新项目签约即归档三件套。约 30 天。",
    leadTimeDays: 30, evidenceLevel: "L3",
  },
  {
    id: "G-TRM-01", level: "conditional", fieldKey: "trade_terms", emptyMulti: true,
    titleKey: "bidGateRTradeTerms", titleZh: "无贸易条款与结算能力",
    gapZh: "不能报 FOB/CIF/DDP/DAP，不接受 30 天以上账期，无多币种结算或锁汇手段。",
    remediationZh: "先固定 2 种 Incoterms（FOB + CIF）出标准报价模板，并与银行确认收汇与锁汇方案。约 30 天。",
    leadTimeDays: 30, evidenceLevel: "L3",
  },
];

/** B 段竞争力分档线（与报告文案一致：≥78 主投 / 60–78 慎投 / <60 不建议） */
export const BID_COMPETITIVENESS_BANDS = { strong: 78, viable: 60 } as const;

/** 资格判定所需的外部派生输入（前端预判时可全部省略） */
export interface BidGateDerived {
  /** 目标市场法定准入缺口数；缺省视为 0，即不做准入判断 */
  legalMissingCount?: number;
  /** 目标市场法定证书覆盖率 0–100；仅用于报告展示，不参与闸门 */
  certCoveragePercent?: number;
}

export interface BidGateHit {
  id: string;
  level: BidGateLevel;
  fieldKey: string;
  titleZh: string;
  titleKey: string;
  gapZh: string;
  remediationZh: string;
  leadTimeDays: number | null;
  evidenceLevel: BidEvidenceLevel;
}

export interface BidGateResult {
  eligibility: BidEligibility;
  competitiveness: BidCompetitiveness;
  /** 废标项（决定出局） */
  disqualifiers: BidGateHit[];
  /** 可补项（补齐后可投） */
  conditionals: BidGateHit[];
  /** 全部命中项，废标项在前、可补项按补齐周期升序 */
  hits: BidGateHit[];
  /** 优先整改的前 3 条（废标优先，其次周期短的） */
  nextActions: BidGateHit[];
  /** 一句话结论（中文，供结果页与报告直接引用） */
  verdictZh: string;
  /** 该结论依赖的数据是否完整（前端预判时为 false，因为没拿到准入缺口） */
  derivedComplete: boolean;
}

/** 字段选项序号；取不到返回 -1 */
function optionIndexOf(fieldKey: string, value: string | string[] | undefined): number {
  const field: DiagnosisV5FieldDef | undefined = DIAGNOSIS_V5_FIELD_MAP[fieldKey];
  if (!field?.options) return -1;
  const raw = Array.isArray(value) ? value[0] ?? "" : String(value ?? "");
  const v = raw.trim();
  if (!v) return -1;
  return field.options.indexOf(v);
}

/** 多选题已选项数（容错逗号串，与仓储写库同语义） */
function multiCount(value: string | string[] | undefined): number {
  if (Array.isArray(value)) return value.filter((v) => String(v).trim() !== "").length;
  return String(value ?? "").split(/[,，;；]/).map((s) => s.trim()).filter(Boolean).length;
}

/** 单条规则是否命中 */
function hitOf(
  rule: BidGateRule,
  answers: Record<string, string | string[]>,
  derived: BidGateDerived,
  partial: boolean,
): BidGateHit | null {
  // 派生规则：准入缺口
  if (rule.id === "G-LGL-03" || rule.id === "G-LGL-01") {
    const missing = Number(derived.legalMissingCount ?? 0);
    const threshold = rule.id === "G-LGL-03" ? 3 : 1;
    if (!(missing >= threshold)) return null;
    return {
      ...toHit(rule),
      gapZh: rule.gapZh.replace(/\d+ 项/g, `${missing} 项`),
    };
  }
  if (rule.emptyMulti) {
    // 未作答（字段不在作答里）不判：空表不该直接显示红项
    if (!(rule.fieldKey in answers)) return null;
    // 填写中（partial）不判多选空：用户可能还没滚到这道题
    if (partial) return null;
    return multiCount(answers[rule.fieldKey]) === 0 ? toHit(rule) : null;
  }
  const idx = optionIndexOf(rule.fieldKey, answers[rule.fieldKey]);
  if (idx < 0) return null; // 未作答：不判，避免空表误报红项
  if (rule.maxOptionIndex == null) return null;
  return idx <= rule.maxOptionIndex ? toHit(rule) : null;
}

function toHit(rule: BidGateRule): BidGateHit {
  return {
    id: rule.id,
    level: rule.level,
    fieldKey: rule.fieldKey,
    titleZh: rule.titleZh,
    titleKey: rule.titleKey,
    gapZh: rule.gapZh,
    remediationZh: rule.remediationZh,
    leadTimeDays: rule.leadTimeDays,
    evidenceLevel: rule.evidenceLevel,
  };
}

/** 整改排序：废标项优先，其次周期短优先，周期未知排后 */
function sortForAction(a: BidGateHit, b: BidGateHit): number {
  if (a.level !== b.level) return a.level === "disqualify" ? -1 : 1;
  const av = a.leadTimeDays ?? Number.POSITIVE_INFINITY;
  const bv = b.leadTimeDays ?? Number.POSITIVE_INFINITY;
  return av - bv;
}

/**
 * 判定资格。
 * @param answers 表单作答
 * @param partBScore B 段加权得分（0–50）。用来算竞争力分档，不参与资格判定
 * @param derived 准入缺口等外部派生量；省略即视为数据不全，只判表单规则
 * @param options.partial 填写中预判：多选为空暂不判红（用户可能还没填到那道题）。
 *        结果页与服务端必须用默认的 false，否则会漏判「一条渠道都没注册」。
 */
export function evaluateBidGate(
  answers: Record<string, string | string[]>,
  partBScore: number,
  derived: BidGateDerived = {},
  options: { partial?: boolean } = {},
): BidGateResult {
  const derivedComplete = derived.legalMissingCount != null;
  const partial = options.partial === true;

  const hits: BidGateHit[] = [];
  for (const rule of BID_GATE_RULES) {
    const hit = hitOf(rule, answers, derived, partial);
    if (hit) hits.push(hit);
  }

  const disqualifiers = hits.filter((h) => h.level === "disqualify");
  const conditionals = hits.filter((h) => h.level === "conditional").sort(sortForAction);

  const eligibility: BidEligibility = disqualifiers.length > 0
    ? "out"
    : conditionals.length > 0
      ? "conditional"
      : "qualified";

  const b = Math.max(0, Math.min(50, Number(partBScore) || 0));
  const b100 = Math.round((b / 50) * 1000) / 10;
  const competitiveness: BidCompetitiveness = b100 >= BID_COMPETITIVENESS_BANDS.strong
    ? "strong"
    : b100 >= BID_COMPETITIVENESS_BANDS.viable
      ? "viable"
      : "weak";

  const ordered = [...disqualifiers, ...conditionals].sort(sortForAction);

  return {
    eligibility,
    competitiveness,
    disqualifiers,
    conditionals,
    hits: ordered,
    nextActions: ordered.slice(0, 3),
    verdictZh: verdictOf(eligibility, competitiveness, disqualifiers.length, conditionals.length),
    derivedComplete,
  };
}

function verdictOf(
  eligibility: BidEligibility,
  competitiveness: BidCompetitiveness,
  hardCount: number,
  softCount: number,
): string {
  if (eligibility === "out") {
    return `暂不具备投标资格：存在 ${hardCount} 项废标级缺口，该国别该标类不可投。以下整改完成前，总分高低不改变结论。`;
  }
  if (eligibility === "conditional") {
    return `有条件可投：主体资格已过，另有 ${softCount} 项可补缺口。补齐后可进入投标名单。`;
  }
  if (competitiveness === "weak") {
    return "资格已具备，可进入投标名单；但能力画像偏弱，标书成本可能收不回，建议先做成本与对手报价分析。";
  }
  if (competitiveness === "viable") {
    return "资格已具备，能力画像中等：可投，投标前先关闭 1–2 项能力缺口并核对手报价区间。";
  }
  return "资格与能力均达标：可主投核心标段，建议配 3 标深拆、1 标提交。";
}

/** 结论徽章文案 */
export function bidEligibilityLabel(eligibility: BidEligibility): string {
  if (eligibility === "out") return "不可投（废标项未过）";
  if (eligibility === "conditional") return "有条件可投";
  return "可进入投标名单";
}

/** 竞争力徽章文案 */
export function bidCompetitivenessLabel(c: BidCompetitiveness): string {
  if (c === "strong") return "竞争力达标";
  if (c === "viable") return "竞争力中等";
  return "竞争力偏弱";
}

/**
 * 结构自检：规则引用的字段必须存在，单选规则必须有 maxOptionIndex。
 * 由单元测试调用；生产代码不重复执行。
 */
export function assertBidGateIntact(): void {
  const seen = new Set<string>();
  for (const rule of BID_GATE_RULES) {
    if (seen.has(rule.id)) throw new Error(`bid gate rule duplicated: ${rule.id}`);
    seen.add(rule.id);
    const field = DIAGNOSIS_V5_FIELD_MAP[rule.fieldKey];
    if (!field) throw new Error(`bid gate rule ${rule.id} references unknown field ${rule.fieldKey}`);
    const isDerivedRule = rule.id === "G-LGL-03" || rule.id === "G-LGL-01";
    if (isDerivedRule) continue;
    if (rule.emptyMulti) {
      if (field.kind !== "multi") throw new Error(`bid gate rule ${rule.id}: emptyMulti needs a multi field`);
      continue;
    }
    if (rule.maxOptionIndex == null) throw new Error(`bid gate rule ${rule.id}: missing maxOptionIndex`);
    if (field.kind !== "single") throw new Error(`bid gate rule ${rule.id}: maxOptionIndex needs a single field`);
    if (!field.options || rule.maxOptionIndex >= field.options.length) {
      throw new Error(`bid gate rule ${rule.id}: maxOptionIndex out of range`);
    }
  }
}
