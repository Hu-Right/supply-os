/**
 * AI 拆标摘要 Prompt 模板 v2
 * @module lib/services/ai-summary/prompt
 * @description 6 维度结构化分析：核心交付/资质门槛/商务要素/竞争格局/投标策略/风险提示。
 *              支持附件内容摘要和企业简介注入。描述截断 4000 字。
 */

export const SYSTEM_PROMPT = `你是一位拥有 15 年经验的国际采购投标顾问，专精联合国及国际公共采购。

## 分析原则
1. 所有结论必须基于公告原文事实，不可臆造。找不到信息时明确标注"公告未披露"。
2. 用具体数据和条款支撑每个判断，避免"建议关注""可能存在"等模糊表述。
3. 站在供应商视角，给出可操作的投标建议。

## 输出格式
严格输出以下 JSON（6 个字段，每个字段为一段中文文本，150-350 字），不要输出任何额外解释或 markdown：
{
  "coreDeliverables": "核心交付物：逐条列出本标要求采购的具体产品/服务/工程内容，标注数量和规格",
  "keyQualifications": "资质门槛：分【必须满足】和【加分项】两级列出资质、认证、注册等级、业绩要求等",
  "paymentCycle": "商务要素：预算规模、付款条件（分期/里程碑）、交付周期、币种、价格调整机制",
  "competitiveLandscape": "竞争格局：分析潜在竞争对手类型（本地/国际/国企/民企）、市场集中度、中标常见特征",
  "bidStrategy": "投标策略：基于供应商画像，给出差异化竞争建议、联合体建议、报价策略方向",
  "riskAlerts": "风险提示：列出 2-4 个具体风险点，每个附带应对建议"
}`;

const DESC_MAX = 4000;
const ATTACH_MAX = 3000;

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

/** 公告字段子集 */
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
  /** 附件文本摘要（前 2 个附件提取结果拼接） */
  attachments_text?: string;
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
  /** 企业简介 */
  intro?: string;
  // 诊断表字段
  employee_count?: string;
  export_scale?: string;
  service_countries?: string;
  overseas_companies?: string;
  ungm_status?: string;
  english_team?: string;
  payment_terms?: string;
  bid_willingness?: string;
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

  // 附件内容摘要
  const attText = sanitize(truncate(String(notice.attachments_text || ""), ATTACH_MAX));
  if (attText) {
    parts.push(`\n## 附件内容摘要\n${attText}`);
  }

  if (supplier && String(supplier.company || "").trim()) {
    parts.push("\n## 我的企业画像");
    parts.push(line("公司名称", supplier.company));
    parts.push(line("所属行业", supplier.industry));
    parts.push(line("主营产品", supplier.products));
    parts.push(line("资质证书", supplier.certification, "未填写"));
    parts.push(line("所在地区", [supplier.country, supplier.city].filter(Boolean).join(" ")));
    parts.push(line("经营类型", supplier.type));
    parts.push(line("员工规模", supplier.employee_count));
    if (supplier.intro) {
      parts.push(line("企业简介", truncate(supplier.intro, 500)));
    }

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

    parts.push("\n请结合我的企业画像，分析我是否适合参与本标，并给出 6 个维度的适配分析。");
  } else {
    parts.push("\n（该企业未绑定供应商画像，请给出通用投标分析。）");
  }

  return parts.join("\n");
}
