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

export interface EvidenceView {
  id: number;
  category: string;
  title: string;
  validFrom: string | null;
  validUntil: string | null;
  noExpiry: boolean;
  hasFile: boolean;
  downloadUrl: string | null;
}

export interface ProfileResponse {
  enterpriseId: number;
  company: string;
  capabilities: CapabilityView[];
  evidence: EvidenceView[];
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

export const EVIDENCE_LABEL_KEYS: Record<string, string> = {
  cert: "capEvidenceCert",
  experience: "capEvidenceExperience",
  financial: "capEvidenceFinancial",
  personnel: "capEvidencePersonnel",
  other: "capEvidenceOther",
};

export const inputCls =
  "w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500";

export type CapTranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function capabilitySummary(capability: CapabilityView, t: CapTranslateFn): string {
  const v = capability.value ?? {};
  const s = (key: string) => (v[key] == null || v[key] === "" ? "" : String(v[key]));
  switch (capability.type) {
    case "certification":
      return [s("code"), s("validUntil") ? t("capValidUntil", { date: s("validUntil") }) : t("capNoExpiry")].filter(Boolean).join(" · ");
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
