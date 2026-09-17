/**
 * AI 适配评分 Prompt 模板
 * @module lib/services/ai-score/prompt
 * @description 7 维度结构化评分：资质/经验/认证/地域/规模/交期/价格。
 *              输出 JSON：7 个维度分数(0-100) + 综合分 + 每维度一句话理由。
 */

export const SCORE_SYSTEM_PROMPT = `你是一位拥有 15 年经验的国际采购投标顾问。根据招标公告要求和供应商企业画像，从 7 个维度评估该供应商参与本标的适配度。

## 评分原则
1. 每个维度 0-100 分，基于公告原文事实和企业画像数据，不可臆造。
2. 信息缺失时给保守分（40-60），不要给极端分。
3. 综合分 = 7 维度加权平均（资质20% 经验15% 认证15% 地域10% 规模15% 交期10% 价格15%）。
4. 每个维度的理由必须引用具体证据，格式："企业侧事实 vs 公告侧要求 → 结论"。
   例："企业拥有ISO9001/CE认证，公告要求ISO9001，完全覆盖→高分" 或 "公告要求本地供应商，企业位于中国→地域不适配→低分"。
   理由控制在 50 字以内，必须让用户看懂分数从何而来。

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
  "reasons": {
    "qualification": "一句话理由",
    "experience": "一句话理由",
    "certification": "一句话理由",
    "region": "一句话理由",
    "scale": "一句话理由",
    "delivery": "一句话理由",
    "price": "一句话理由"
  }
}`;

/** 评分维度 key 列表 */
export const SCORE_DIMENSIONS = [
  "qualification", "experience", "certification",
  "region", "scale", "delivery", "price",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export interface AiScoreRaw {
  qualification: number;
  experience: number;
  certification: number;
  region: number;
  scale: number;
  delivery: number;
  price: number;
  overall: number;
  reasons: Record<ScoreDimension, string>;
}

/** 组装评分用户提示词（复用公告+供应商画像数据） */
export function buildScoreUserPrompt(
  notice: Record<string, unknown>,
  supplier: Record<string, unknown> | null,
): string {
  const line = (label: string, value: unknown) =>
    `- ${label}：${String(value ?? "").trim() || "未列出"}`;

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
    if (supplier.intro) parts.push(line("企业简介", String(supplier.intro).slice(0, 300)));
    parts.push("\n请从 7 个维度评估我参与本标的适配度，输出 JSON 评分。");
  } else {
    parts.push("\n（未绑定企业画像，请基于公告要求给出通用基准分。）");
  }

  return parts.join("\n");
}
