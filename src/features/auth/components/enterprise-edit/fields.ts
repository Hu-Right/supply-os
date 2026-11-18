/**
 * 企业信息编辑表单 — 字段定义与样式常量（自 EnterpriseEditForm.tsx 拆出，逐字不变）。
 *
 * @module features/auth/components/enterprise-edit/fields
 */

/** 表格单元格样式常量（label 灰底 + 输入值格） */
export const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0 disabled:opacity-50";
export const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";
export const inputCls = "w-full px-2 py-1.5 rounded border border-border bg-white text-xs text-foreground focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none";

export interface OptionDef { value: string; labelKey: string; fallback: string }
export interface FieldDef {
  key: string;
  labelKey: string;
  fallback: string;
  full?: boolean;
  textarea?: boolean;
  inputType?: "text" | "date";
  options?: OptionDef[];
  placeholderKey?: string;
  placeholder?: string;
}

export const BASIC_FIELDS: FieldDef[] = [
  { key: "company", labelKey: "authEnterpriseName", fallback: "企业名称", placeholderKey: "authEnterpriseNamePh" },
  // english_name（企业英文法务名）输入框已于 2026-09-26 撤下：实库该列一行都没填过；
  // 2026-09-28 影子表重建时列已物理删除，如需复活须先走一次加列迁移。
  { key: "province", labelKey: "authEnterpriseProvince", fallback: "省份", placeholderKey: "authEnterpriseProvincePh" },
  { key: "city", labelKey: "authEnterpriseCity", fallback: "城市", placeholderKey: "authEnterpriseCityPh" },
  { key: "address", labelKey: "authEnterpriseBizAddress", fallback: "经营地址", full: true, placeholderKey: "authEnterpriseBizAddressPh" },
];
export const CONTACT_FIELDS: FieldDef[] = [
  { key: "contact", labelKey: "authEnterpriseContact", fallback: "联系人", placeholderKey: "authEnterpriseContactPh" },
  { key: "position", labelKey: "authEnterprisePosition", fallback: "职位", placeholderKey: "authEnterprisePositionPh" },
  { key: "phone", labelKey: "authEnterprisePhone", fallback: "联系电话", placeholderKey: "authEnterprisePhonePh" },
  { key: "email", labelKey: "authEnterpriseEmail", fallback: "邮箱", placeholderKey: "authEnterpriseEmailPh" },
  { key: "website", labelKey: "authEnterpriseWebsite", fallback: "官网", full: true, placeholderKey: "authEnterpriseWebsitePh" },
];
export const BUSINESS_FIELDS: FieldDef[] = [
  { key: "legal_rep", labelKey: "authEnterpriseLegalRep", fallback: "法定代表人", placeholderKey: "authEnterpriseLegalRepPh" },
  { key: "established_at", labelKey: "authEnterpriseEstablished", fallback: "成立日期", inputType: "date", placeholderKey: "authEnterpriseEstablishedPh" },
  { key: "registered_capital", labelKey: "authEnterpriseCapital", fallback: "注册资本", placeholderKey: "authEnterpriseCapitalPh" },
  // 证件类型：默认 uscc；香港/海外主体选择 BR/CR/海外注册号/税号，号码字段的标签与校验随之切换
  {
    key: "credit_code_type",
    labelKey: "authEnterpriseCreditCodeType",
    fallback: "证件类型",
    options: [
      { value: "uscc", labelKey: "authRegIdType_uscc", fallback: "统一社会信用代码（中国大陆）" },
      { value: "hk_br", labelKey: "authRegIdType_hk_br", fallback: "商业登记号 BR（香港）" },
      { value: "hk_cr", labelKey: "authRegIdType_hk_cr", fallback: "公司注册编号 CR（香港）" },
      { value: "overseas_reg", labelKey: "authRegIdType_overseas_reg", fallback: "公司注册号（海外）" },
      { value: "tax_id", labelKey: "authRegIdType_tax_id", fallback: "税号 / VAT / EIN" },
      { value: "other", labelKey: "authRegIdType_other", fallback: "其他注册标识" },
    ],
  },
  // 号码字段的 label/placeholder 由表单按当前类型动态覆盖（labelKey/placeholderKey 只是 uscc 兜底）
  { key: "credit_code", labelKey: "authRegIdField_uscc", fallback: "统一社会信用代码（18 位）", placeholderKey: "authRegIdPh_uscc" },
  { key: "certification", labelKey: "authEnterpriseCertifications", fallback: "资质认证", placeholderKey: "authEnterpriseCertificationsPh" },
];

/** 必填字段（预提交阻断校验点名用） */
export const REQUIRED_KEYS: { key: string; labelKey: string; fallback: string }[] = [
  { key: "company", labelKey: "authEnterpriseName", fallback: "企业名称" },
  { key: "credit_code", labelKey: "authEnterpriseCreditCode", fallback: "统一社会信用代码" },
  { key: "legal_rep", labelKey: "authEnterpriseLegalRep", fallback: "法定代表人" },
  { key: "province", labelKey: "authEnterpriseProvince", fallback: "省份" },
  { key: "city", labelKey: "authEnterpriseCity", fallback: "城市" },
  { key: "address", labelKey: "authEnterpriseBizAddress", fallback: "经营地址" },
  { key: "contact", labelKey: "authEnterpriseContact", fallback: "联系人" },
  { key: "phone", labelKey: "authEnterprisePhone", fallback: "联系电话" },
  { key: "products", labelKey: "authEnterpriseProductIntro", fallback: "产品介绍" },
];

/** 全部可编辑字段（容器初始化 values 时的唯一事实源） */
export const ALL_FIELD_GROUPS: FieldDef[][] = [BASIC_FIELDS, CONTACT_FIELDS, BUSINESS_FIELDS];
