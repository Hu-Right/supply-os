/**
 * AI 适配评分 Prompt 模板 v3（判据改挂 v2 诊断表）
 * @module lib/services/ai-score/prompt
 * @description 7 维度结构化评分：资质合规 / 投标履历 / 强制文件 / 地域可达 / 规模团队 / 交付受控 / 成本条款。
 *              输出 JSON：7 维度分数 + 综合分 + 每维度结构化证据（reason + matched + gaps）。
 *
 *              v3 的关键变化：每个维度的**判据字段**明确钉到 `crm_supplier_diagnosis` 的具体列，
 *              模型不再靠"企业简介"猜能力；`DIMENSION_V2_SOURCES` 是这份映射的唯一出处，
 *              并由单元测试钉住「19 列不重不漏」，防止加题后某一题从未进过 prompt。
 *
 *              维度 key（qualification/experience/...）**刻意不改名**：它们同时是
 *              `crm_ai_summary.score_*` 列名、缓存 JSON 的键、LLM 输出契约与前端进度条 key，
 *              改名的代价是一次数据迁移，而收益只是命名好看 —— 语义靠 label/criteria/判据重述即可。
 */
import { DIAGNOSIS_AI_LABEL_ZH, diagnosisItemsOf } from "../ai/shared/supplier-profile";

export const SCORE_SYSTEM_PROMPT = `你是一位拥有 15 年经验的国际采购投标顾问。根据招标公告要求和供应商企业画像，从 7 个维度评估该供应商参与本标的适配度。

## 评分原则
1. 每个维度 0-100 分，只能引用「企业画像」与「企业能力诊断」里出现的事实，不可编造。
2. 每个维度下方已标注该维度依据的诊断字段。字段标注为"未答"或缺失时给保守分（40-60），不要给极端分，也不要把"未答"当成"不具备"。
3. 综合分 = 7 维度加权平均，权重根据公告类型动态调整（见用户提示词中的权重说明）。
4. 每个维度必须给出结构化证据：
   - reason：一句话总结（50字内），格式"企业侧 vs 公告侧 → 结论"。
   - matched：数组，列出"企业已具备且公告认可/要求"的具体匹配项（2-4条，每条20字内）。无则空数组。
   - gaps：数组，列出"公告要求但企业缺失/不足"的具体差距项（0-3条，每条20字内）。无则空数组。
   证据必须具体到事实（如"有中标记录""缺第三方检测报告""公告要求本地代理"），不可泛泛而谈。

## 输出格式
先输出一段完整的分析推理过程（300-500字，中文），逐维度分析企业的优势与不足，然后输出 JSON 评分。

分析推理过程格式示例：
"本标为工程类采购，资质和地域权重较高。企业 UNGM 已达 Level 1 且有合规专岗，满足基本资质要求，但近 24 个月无中标记录、且无法直接交付至项目国..."

JSON 格式（严格输出，不要输出任何额外解释或 markdown）：
{
  "qualification": 85,
  "experience": 70,
  "certification": 60,
  "region": 90,
  "scale": 75,
  "delivery": 80,
  "price": 65,
  "overall": 75,
  "details": {
    "qualification": { "reason": "…", "matched": ["…"], "gaps": ["…"] },
    "experience": { "reason": "…", "matched": ["…"], "gaps": ["…"] },
    "certification": { "reason": "…", "matched": ["…"], "gaps": ["…"] },
    "region": { "reason": "…", "matched": ["…"], "gaps": ["…"] },
    "scale": { "reason": "…", "matched": ["…"], "gaps": ["…"] },
    "delivery": { "reason": "…", "matched": ["…"], "gaps": ["…"] },
    "price": { "reason": "…", "matched": ["…"], "gaps": ["…"] }
  }
}`;

/** 评分维度 key 列表（同时是 score_* 列名与缓存 JSON 键，勿改名） */
export const SCORE_DIMENSIONS = [
  "qualification", "experience", "certification",
  "region", "scale", "delivery", "price",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** 维度中文名映射（v2 语义重述；同时用于 prompt 里的权重说明） */
const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  qualification: "资质与合规",
  experience: "投标履历",
  certification: "强制文件覆盖",
  region: "交付地域可达",
  scale: "规模与团队",
  delivery: "交付与提交受控",
  price: "成本与报价条款",
};

/**
 * 每个维度的判据字段 = crm_supplier_diagnosis 的列名。
 * 除 bid_willingness（纯意向、不计分）外，19 列必须在此被引用且互不复用。
 */
export const DIMENSION_V2_SOURCES: Record<ScoreDimension, readonly string[]> = {
  qualification: ["ungm_status", "compliance_governance", "english_evidence_level"],
  experience: ["tender_experience", "tender_amount_band", "technical_response"],
  certification: ["mandatory_docs"],
  region: ["deliver_to_site", "service_countries", "overseas_companies"],
  scale: ["export_scale", "team_discipline", "procurement_frameworks"],
  delivery: ["submission_control", "english_meeting_capability"],
  price: ["cost_pricing", "incoterms_capability", "payment_terms"],
};

/** 不计入任何维度、但仍需作为背景呈现的列 */
const UNSCORED_COLUMNS = ["bid_willingness"] as const;

/** 根据公告类型获取维度权重 */
export function getDimensionWeights(noticeType?: string): Record<ScoreDimension, number> {
  const type = String(noticeType || "").toLowerCase();

  // 工程类：重资质、重地域、轻价格
  if (type.includes("工程") || type.includes("construction") || type.includes("works")) {
    return {
      qualification: 0.30,
      experience: 0.15,
      certification: 0.15,
      region: 0.20,
      scale: 0.10,
      delivery: 0.10,
      price: 0.10,
    };
  }

  // 货物类：重价格、重认证、轻地域
  if (type.includes("货物") || type.includes("goods") || type.includes("supply") || type.includes("采购")) {
    return {
      qualification: 0.15,
      experience: 0.15,
      certification: 0.20,
      region: 0.10,
      scale: 0.15,
      delivery: 0.10,
      price: 0.25,
    };
  }

  // 服务类：重地域、重资质、轻规模
  if (type.includes("服务") || type.includes("service") || type.includes("consulting")) {
    return {
      qualification: 0.25,
      experience: 0.20,
      certification: 0.10,
      region: 0.25,
      scale: 0.05,
      delivery: 0.10,
      price: 0.15,
    };
  }

  // 默认权重（通用）
  return {
    qualification: 0.20,
    experience: 0.15,
    certification: 0.15,
    region: 0.10,
    scale: 0.15,
    delivery: 0.10,
    price: 0.15,
  };
}

/** 生成权重说明文本 */
function buildWeightText(weights: Record<ScoreDimension, number>): string {
  return Object.entries(weights)
    .map(([key, value]) => `${DIMENSION_LABELS[key as ScoreDimension]}${Math.round(value * 100)}%`)
    .join(" ");
}

/** 单个维度的结构化证据 */
export interface DimensionDetail {
  reason: string;
  matched: string[];
  gaps: string[];
}

export interface AiScoreRaw {
  qualification: number;
  experience: number;
  certification: number;
  region: number;
  scale: number;
  delivery: number;
  price: number;
  overall: number;
  details: Record<ScoreDimension, DimensionDetail>;
  /** 思维链推理过程文本 */
  reasoning: string;
}

/** 评估视角：self = 评“我自己”（适配评分）；candidate = 评“候选工厂/友商”（统一评估） */
export type ScorePerspective = "self" | "candidate";

/**
 * 企业能力诊断块：逐维度列出其判据字段的实际取值。
 * 未做诊断时明确写"未填写"，让模型走保守分分支，而不是拿空字符串当事实。
 */
function buildDiagnosisLines(supplier: Record<string, unknown>): string[] {
  const filled = new Map(diagnosisItemsOf(supplier));

  if (filled.size === 0) {
    return [
      "\n## 企业能力诊断（v2）",
      "- 未填写诊断表：各维度判据字段均视为缺失，按保守分（40-60）评分，并在 gaps 中标注「缺少能力诊断依据」。",
    ];
  }

  const lines: string[] = ["\n## 企业能力诊断（v2 结构化自述，逐维度标注判据）"];
  for (const dim of SCORE_DIMENSIONS) {
    const parts = DIMENSION_V2_SOURCES[dim].map(
      (column) => `${DIAGNOSIS_AI_LABEL_ZH[column] ?? column}=${filled.get(column) ?? "未答"}`,
    );
    lines.push(`- ${DIMENSION_LABELS[dim]}（${dim}）依据：${parts.join("；")}`);
  }
  const extra = UNSCORED_COLUMNS.filter((c) => filled.has(c)).map((c) => `${DIAGNOSIS_AI_LABEL_ZH[c]}=${filled.get(c)}`);
  if (extra.length > 0) lines.push(`- 背景（不计分）：${extra.join("；")}`);
  return lines;
}

/** 组装评分用户提示词（复用公告+供应商画像数据） */
export function buildScoreUserPrompt(
  notice: Record<string, unknown>,
  supplier: Record<string, unknown> | null,
  perspective: ScorePerspective = "self",
): string {
  const line = (label: string, value: unknown) =>
    `- ${label}：${String(value ?? "").trim() || "未提供"}`;

  // 根据公告类型动态调整权重
  const weights = getDimensionWeights(String(notice.notice_type || ""));
  const weightText = buildWeightText(weights);

  const parts: string[] = ["## 招标公告要求"];
  parts.push(line("标题", notice.title));
  parts.push(line("采购类型", notice.notice_type));
  parts.push(line("国家/地区", notice.country));
  parts.push(line("预算金额", notice.estimated_value));
  parts.push(line("截止时间", notice.deadline));
  parts.push(line("资格要求", notice.eligibility));
  parts.push(line("技术门槛", notice.technical_hurdles));
  parts.push(line("供应商条件", notice.supplier_conditions));

  if (supplier && String(supplier.company || "").trim()) {
    parts.push(perspective === "self" ? "\n## 我的企业画像" : "\n## 候选供应商画像");
    parts.push(line("公司名称", supplier.company));
    parts.push(line("所属行业", supplier.industry));
    parts.push(line("主营产品", supplier.products));
    parts.push(line("资质证书（主数据）", supplier.certification));
    parts.push(line("所在地区", [supplier.country, supplier.city].filter(Boolean).join(" ")));
    parts.push(line("注册资本", supplier.registered_capital));
    parts.push(line("成立日期", supplier.established_at));
    parts.push(line("经营类型", supplier.type));
    if (supplier.intro) parts.push(line("企业简介", String(supplier.intro).slice(0, 300)));

    parts.push(...buildDiagnosisLines(supplier));

    parts.push(
      perspective === "self"
        ? `\n请从 7 个维度评估我参与本标的适配度。`
        : `\n请从 7 个维度评估该供应商承接本标的的适配度。`,
    );
    parts.push(`综合分 = 加权平均（${weightText}）。`);
    parts.push("输出 JSON 评分。");
  } else {
    parts.push("\n（未绑定企业画像，请基于公告要求给出通用基准分。）");
  }

  return parts.join("\n");
}
