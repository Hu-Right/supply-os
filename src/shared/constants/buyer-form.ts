/**
 * 采购主体（F01）必填口径 — 前端与 API 共用的唯一判定
 *
 * @module shared/constants/buyer-form
 * @description 页面打 `*` 的字段必须在“每一次保存”时都被拦截，而不是只在首次创建时。
 *              2026-11 缺陷：认证页只对 `!buyer` 校验，已存在主体把必填项清空也能保存，
 *              与界面 `*` 语义不一致；同时 API 只校验了法定名称。
 *
 *              这里只做“是否缺失”的纯判定（不依赖 i18n / DOM），
 *              前端负责把 key 映射成当前语言文案，服务端映射成中文错误信息。
 */

export type BuyerRequiredFieldKey =
  | "org_name"
  | "buyer_role"
  | "country"
  | "reg_no"
  | "official_email"
  | "auth_contact_name"
  | "license"
  | "agent_auth_doc";

export interface BuyerRequiredInput {
  orgName?: string | null;
  buyerRole?: string | null;
  country?: string | null;
  regNo?: string | null;
  officialEmail?: string | null;
  authContactName?: string | null;
  /** 已有执照或本次已选文件 */
  hasLicense?: boolean;
  /** 已有代理授权文件或本次已选文件（仅代理角色需要） */
  hasAgentAuthDoc?: boolean;
}

/** 服务端错误信息用中文名（与认证页标签一致） */
export const BUYER_REQUIRED_FIELD_LABELS_ZH: Record<BuyerRequiredFieldKey, string> = {
  org_name: "采购主体完整法定名称",
  buyer_role: "采购权限",
  country: "注册国家",
  reg_no: "注册标识号码",
  official_email: "企业邮箱",
  auth_contact_name: "授权联系人姓名",
  license: "营业执照/注册文件",
  agent_auth_doc: "代理采购授权文件",
};

function filled(value: string | null | undefined): boolean {
  return Boolean(String(value ?? "").trim());
}

/**
 * 返回缺失的必填字段（按表单顺序）。
 * 代理授权文件只在 buyerRole = authorized_agent 时要求。
 */
export function missingBuyerFields(input: BuyerRequiredInput): BuyerRequiredFieldKey[] {
  const missing: BuyerRequiredFieldKey[] = [];
  if (!filled(input.orgName)) missing.push("org_name");
  if (!filled(input.buyerRole)) missing.push("buyer_role");
  if (!filled(input.country)) missing.push("country");
  if (!filled(input.regNo)) missing.push("reg_no");
  if (!filled(input.officialEmail)) missing.push("official_email");
  if (!filled(input.authContactName)) missing.push("auth_contact_name");
  if (!input.hasLicense) missing.push("license");
  if (input.buyerRole === "authorized_agent" && !input.hasAgentAuthDoc) {
    missing.push("agent_auth_doc");
  }
  return missing;
}
