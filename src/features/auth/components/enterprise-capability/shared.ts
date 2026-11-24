/**
 * 企业能力档案 — 共享类型/字典/摘要（自 EnterpriseCapabilitySection.tsx 拆出）
 *
 * @module features/auth/components/enterprise-capability/shared
 * @description 能力八类型与证据类目的类型、i18n 键映射、输入框公共类、
 *              能力项摘要行渲染。2026-10-31 组件化拆分：主文件只留编排。
 */

export type CapabilityType =
  | "certification"
  | "experience"
  | "financial"
  | "personnel"
  | "localization"
  | "registration"
  | "technical"
  | "text";

export type FieldValue = string | boolean;

export interface CapabilityView {
  id: number;
  type: CapabilityType;
  name: string;
  value: Record<string, unknown>;
}

export interface ProfileResponse {
  enterpriseId: number;
  company: string;
  capabilities: CapabilityView[];
}

export const TYPE_LABEL_KEYS: Record<CapabilityType, string> = {
  certification: "capTypeCertification",
  experience: "capTypeExperience",
  financial: "capTypeFinancial",
  personnel: "capTypePersonnel",
  localization: "capTypeLocalization",
  registration: "capTypeRegistration",
  technical: "capTypeTechnical",
  text: "capTypeText",
};

/** 认证字典选项（来自 GET /api/certifications，四键契约） */
export interface CertOption {
  id: number;
  code: string;
  name: string;
  category: string;
}

/** 认证性质 → i18n 键：证书下拉的分组标题 */
export const CERT_CATEGORY_LABEL_KEYS: Record<string, string> = {
  management: "capCertCatManagement",
  industry: "capCertCatIndustry",
  market_access: "capCertCatMarketAccess",
  product_safety: "capCertCatProductSafety",
  esg: "capCertCatEsg",
};

/** 分组顺序与字典 id 顺序一致（管理体系 → 行业特定 → 市场准入 → 产品安全 → 社会责任） */
export const CERT_CATEGORY_ORDER = ["management", "industry", "market_access", "product_safety", "esg"] as const;

export const inputCls =
  "w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-500";

export type CapTranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function capabilitySummary(capability: CapabilityView, t: CapTranslateFn): string {
  const v = capability.value ?? {};
  const s = (key: string) => (v[key] == null || v[key] === "" ? "" : String(v[key]));
  switch (capability.type) {
    case "certification": {
      // 三种有效期状态必须分清：长期有效 / 有到期日 / 未填（迁移进来的历史证书是「未知」，
      // 不能显示成长期有效，否则判定口径与展示口径打架）
      const expiry = v.noExpiry === true
        ? t("capNoExpiry")
        : s("validUntil")
          ? t("capValidUntil", { date: s("validUntil") })
          : t("capExpiryUnknown");
      return [s("code"), expiry].filter(Boolean).join(" · ");
    }
    case "experience":
      return [s("count") && t("capSummaryCountItems", { count: s("count") }), s("years") && t("capSummaryYears", { years: s("years") }), s("similarScope")].filter(Boolean).join(" · ");
    case "financial":
      return [s("metric"), s("value"), s("year")].filter(Boolean).join(" · ");
    case "personnel":
      return [s("role"), s("count") && t("capSummaryCountPeople", { count: s("count") })].filter(Boolean).join(" · ");
    case "localization":
      return [
        s("country"),
        v.hasLocalOffice === true ? t("capLocalOffice") : "",
        v.hasLocalAgent === true ? t("capLocalAgent") : "",
        v.hasLocalTaxId === true ? t("capLocalTaxId") : "",
      ].filter(Boolean).join(" · ");
    case "registration":
      return [s("platform"), s("status")].filter(Boolean).join(" · ");
    case "technical":
      return [s("parameter"), s("value") && `${s("value")}${s("unit") ?? ""}`].filter(Boolean).join(" · ");
    default:
      return s("text");
  }
}
