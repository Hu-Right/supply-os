/**
 * AI 拆标摘要 Prompt 模板
 * @module lib/services/ai-summary/prompt
 * @description 组装系统提示词与用户提示词（公告信息 + 供应商画像）。
 *              公告描述截断至 2000 字控制 token 消耗；转义 <script>/围栏 防注入。
 */

export const SYSTEM_PROMPT = `你是一位资深的国际采购分析师。根据招标公告信息和供应商企业画像，输出针对该企业的投标适配分析。分析必须基于公告原文事实，不可臆造。

输出严格遵循以下 JSON 格式（4 个字段，每个字段为一段中文文本，100-300字），不要输出任何额外解释或 markdown：
{
  "coreDeliverables": "核心交付物：本标要求采购的具体产品/服务/工程内容",
  "keyQualifications": "关键资质要求：参与投标必须满足的资质、认证、注册等级等门槛",
  "paymentCycle": "付款与周期建议：预算规模、付款条件、交付时间、币种等商务要素",
  "riskAlerts": "风险提示：基于公告内容识别的 2-4 个投标风险点"
}`;

const DESC_MAX = 2000;

/** 安全截断 */
export function truncate(text: string, max: number): string {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

/** 防 prompt 注入：转义可能干扰指令的标签/围栏 */
function sanitize(text: string): string {
  return String(text ?? "")
    .replace(/```/g, "")
    .replace(/<\/?script[^>]*>/gi, "")
    .replace(/\$\{|\}/g, "");
}

/** 公告字段子集（仅取组装所需） */
export interface NoticePromptFields {
  title?: string;
  notice_type?: string;
  agency?: string;
  agency_full?: string;
  country?: string;
  deadline?: string;
  estimated_value?: string;
  description?: string;
  description_cn?: string;
  eligibility?: string;
  technical_hurdles?: string;
  supplier_conditions?: string;
  [key: string]: unknown;
}

/** 供应商画像字段子集 */
export interface SupplierPromptFields {
  company?: string;
  industry?: string;
  products?: string;
  certification?: string;
  country?: string;
  city?: string;
  type?: string;
}

function line(label: string, value: unknown, fallback = "未列出"): string {
  const v = String(value ?? "").trim();
  return `- ${label}：${v || fallback}`;
}

/** 组装用户提示词 */
export function buildUserPrompt(
  notice: NoticePromptFields,
  supplier: SupplierPromptFields | null,
): string {
  const desc = sanitize(truncate(
    String(notice.description_cn || notice.description || ""),
    DESC_MAX,
  ));
  const parts: string[] = ["## 招标公告信息"];
  parts.push(line("标题", sanitize(String(notice.title || "")), "-"));
  parts.push(line("采购类型", notice.notice_type));
  parts.push(line("采购方", notice.agency_full || notice.agency));
  parts.push(line("国家/地区", notice.country));
  parts.push(line("截止时间", notice.deadline));
  parts.push(line("预算金额", notice.estimated_value));
  parts.push(line("资格要求", notice.eligibility));
  parts.push(line("技术门槛", notice.technical_hurdles));
  parts.push(line("供应商条件", notice.supplier_conditions));
  parts.push(`- 公告描述：\n${desc || "（无）"}`);

  if (supplier && String(supplier.company || "").trim()) {
    parts.push("\n## 我的企业画像");
    parts.push(line("公司名称", supplier.company));
    parts.push(line("所属行业", supplier.industry));
    parts.push(line("主营产品", supplier.products));
    parts.push(line("资质证书", supplier.certification, "未填写"));
    parts.push(line("所在地区", [supplier.country, supplier.city].filter(Boolean).join(" ")));
    parts.push(line("经营类型", supplier.type));
    parts.push("\n请结合我的企业画像，分析我是否适合参与本标，并给出 4 个维度的适配分析。");
  } else {
    parts.push("\n（该企业未绑定供应商画像，请给出通用投标分析。）");
  }

  return parts.join("\n");
}
