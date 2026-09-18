/**
 * AI 适配评分 Prompt 模板 v2
 * @module lib/services/ai-score/prompt
 * @description 7 维度结构化评分：资质/经验/认证/地域/规模/交期/价格。
 *              输出 JSON：7 维度分数 + 综合分 + 每维度结构化证据
 *              （reason 总结 + matched 匹配项 + gaps 差距项）。
 */

export const SCORE_SYSTEM_PROMPT = `你是一位拥有 15 年经验的国际采购投标顾问。根据招标公告要求和供应商企业画像，从 7 个维度评估该供应商参与本标的适配度。

## 评分原则
1. 每个维度 0-100 分，基于公告原文事实和企业画像数据，不可臆造。
2. 信息缺失时给保守分（40-60），不要给极端分。
3. 综合分 = 7 维度加权平均，权重根据公告类型动态调整（见用户提示词中的权重说明）。
4. 每个维度必须给出结构化证据：
   - reason：一句话总结（50字内），格式"企业侧 vs 公告侧 → 结论"。
   - matched：数组，列出"企业已具备且公告认可/要求"的具体匹配项（2-4条，每条20字内）。无则空数组。
   - gaps：数组，列出"公告要求但企业缺失/不足"的具体差距项（0-3条，每条20字内）。无则空数组。
   证据必须具体到事实（如"企业有ISO9001""公告要求本地供应商"），不可泛泛而谈。

## 输出格式
严格输出以下 JSON，不要输出任何额外解释或 markdown：
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

/** 评分维度 key 列表 */
export const SCORE_DIMENSIONS = [
  "qualification", "experience", "certification",
  "region", "scale", "delivery", "price",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** 维度中文名映射 */
const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  qualification: "资质匹配",
  experience: "经验匹配",
  certification: "认证覆盖",
  region: "地域适配",
  scale: "规模匹配",
  delivery: "交期适配",
  price: "价格竞争力",
};

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
}

/** 组装评分用户提示词（复用公告+供应商画像数据） */
export function buildScoreUserPrompt(
  notice: Record<string, unknown>,
  supplier: Record<string, unknown> | null,
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
    parts.push("\n## 我的企业画像");
    parts.push(line("公司名称", supplier.company));
    parts.push(line("所属行业", supplier.industry));
    parts.push(line("主营产品", supplier.products));
    parts.push(line("资质证书", supplier.certification));
    parts.push(line("所在地区", [supplier.country, supplier.city].filter(Boolean).join(" ")));
    parts.push(line("注册资本", supplier.registered_capital));
    parts.push(line("成立日期", supplier.established_at));
    parts.push(line("经营类型", supplier.type));
    parts.push(line("员工规模", supplier.employee_count));
    if (supplier.intro) parts.push(line("企业简介", String(supplier.intro).slice(0, 300)));

    // 国际化能力（诊断表数据）
    const intlParts: string[] = [];
    if (supplier.export_scale) intlParts.push(`出口规模: ${supplier.export_scale}`);
    if (supplier.service_countries) intlParts.push(`服务国家: ${supplier.service_countries}`);
    if (supplier.overseas_companies) intlParts.push(`海外公司: ${supplier.overseas_companies}`);
    if (supplier.ungm_status) intlParts.push(`UNGM: ${supplier.ungm_status}`);
    if (supplier.english_team) intlParts.push(`英文团队: ${supplier.english_team}`);
    if (supplier.payment_terms) intlParts.push(`付款条件: ${supplier.payment_terms}`);
    if (intlParts.length > 0) {
      parts.push(line("国际化能力", intlParts.join(" | ")));
    }

    parts.push(`\n请从 7 个维度评估我参与本标的适配度。`);
    parts.push(`综合分 = 加权平均（${weightText}）。`);
    parts.push("输出 JSON 评分。");
  } else {
    parts.push("\n（未绑定企业画像，请基于公告要求给出通用基准分。）");
  }

  return parts.join("\n");
}
