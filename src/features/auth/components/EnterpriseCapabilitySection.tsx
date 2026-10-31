"use client";
/**
 * 企业能力档案 + 证据资料库（企业设置页，v0.2）
 *
 * @module features/auth/components/EnterpriseCapabilitySection
 * @description 投标可行性报告的数据来源：企业自己维护「证书/业绩/财务/人员/本地化/注册/技术」
 *              能力项，并上传证据文件（PDF/图片/Office/zip，≤10MB）。
 *              能力项写入 enterprise_capability_items；证据 = upload_files 字节 + enterprise_evidence 元数据。
 *              文案 v0.2 先中文，后续接 i18n（settings 内部页）。
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Eye, Trash2, Upload } from "lucide-react";
import { api, getAuthToken } from "@/core/http";
import { useLocale } from "@/core/i18n";
import { DataState } from "@/shared/ui";

type CapabilityType =
  | "certification"
  | "experience"
  | "financial"
  | "personnel"
  | "localization"
  | "registration"
  | "technical"
  | "text";

interface CapabilityView {
  id: number;
  type: CapabilityType;
  name: string;
  value: Record<string, unknown>;
}

interface EvidenceView {
  id: number;
  category: string;
  title: string;
  validFrom: string | null;
  validUntil: string | null;
  noExpiry: boolean;
  hasFile: boolean;
  downloadUrl: string | null;
}

interface ProfileResponse {
  enterpriseId: number;
  company: string;
  capabilities: CapabilityView[];
  evidence: EvidenceView[];
}

const TYPE_LABEL_KEYS: Record<CapabilityType, string> = {
  certification: "capTypeCertification",
  experience: "capTypeExperience",
  financial: "capTypeFinancial",
  personnel: "capTypePersonnel",
  localization: "capTypeLocalization",
  registration: "capTypeRegistration",
  technical: "capTypeTechnical",
  text: "capTypeText",
};

const EVIDENCE_LABEL_KEYS: Record<string, string> = {
  cert: "capEvidenceCert",
  experience: "capEvidenceExperience",
  financial: "capEvidenceFinancial",
  personnel: "capEvidencePersonnel",
  other: "capEvidenceOther",
};

const inputCls =
  "w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500";

type FieldValue = string | boolean;

function capabilitySummary(capability: CapabilityView, t: (key: string, params?: Record<string, string | number>) => string): string {
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

export interface EnterpriseCapabilitySectionProps {
  /** 已绑定企业才渲染 */
  enabled: boolean;
}

export function EnterpriseCapabilitySection({ enabled }: EnterpriseCapabilitySectionProps) {
  const { t } = useLocale();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capType, setCapType] = useState<CapabilityType>("certification");
  const [capName, setCapName] = useState("");
  const [fields, setFields] = useState<Record<string, FieldValue>>({ noExpiry: true });
  const [savingCap, setSavingCap] = useState(false);

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceCategory, setEvidenceCategory] = useState("cert");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceValidUntil, setEvidenceValidUntil] = useState("");
  const [evidenceNoExpiry, setEvidenceNoExpiry] = useState(true);
  const [savingEvidence, setSavingEvidence] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await api<ProfileResponse>("/api/user/enterprise/capabilities"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const setField = (key: string, value: FieldValue) => setFields((prev) => ({ ...prev, [key]: value }));

  const buildCapabilityValue = (): Record<string, unknown> | null => {
    const f = fields;
    const str = (key: string) => (typeof f[key] === "string" ? String(f[key]).trim() : "");
    switch (capType) {
      case "certification": {
        const validUntil = str("validUntil");
        if (!f.noExpiry && !validUntil) {
          setError(t("capCertExpiryRequired"));
          return null;
        }
        return { code: str("code") || capName, issuer: str("issuer") || null, noExpiry: f.noExpiry === true, validUntil: f.noExpiry ? null : validUntil };
      }
      case "experience":
        return { count: str("count") === "" ? null : Number(str("count")), years: str("years") === "" ? null : Number(str("years")), similarScope: str("similarScope") };
      case "financial":
        return { metric: str("metric"), value: str("value") === "" ? null : Number(str("value")), year: str("year") === "" ? null : Number(str("year")) };
      case "personnel":
        return { role: str("role"), count: str("count") === "" ? null : Number(str("count")) };
      case "localization":
        return { country: str("country") || null, hasLocalOffice: f.hasLocalOffice === true, hasLocalAgent: f.hasLocalAgent === true, hasLocalTaxId: f.hasLocalTaxId === true };
      case "registration":
        return { platform: str("platform"), status: str("status") || "active" };
      case "technical":
        return { parameter: str("parameter"), value: str("value") === "" ? null : Number(str("value")), unit: str("unit") || null };
      default:
        return { text: str("text") };
    }
  };

  const submitCapability = async () => {
    setError(null);
    if (!capName.trim()) {
      setError(t("capNameRequired"));
      return;
    }
    const value = buildCapabilityValue();
    if (!value) return;
    setSavingCap(true);
    try {
      await api("/api/user/enterprise/capabilities", { method: "POST", body: { type: capType, name: capName.trim(), value } });
      setCapName("");
      setFields({ noExpiry: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capSaveFailed"));
    } finally {
      setSavingCap(false);
    }
  };

  const deleteCapability = async (id: number) => {
    setError(null);
    try {
      await api(`/api/user/enterprise/capabilities/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capDeleteFailed"));
    }
  };

  const submitEvidence = async () => {
    setError(null);
    if (!evidenceTitle.trim()) {
      setError(t("capEvidenceTitleRequired"));
      return;
    }
    if (evidenceCategory === "cert" && !evidenceNoExpiry && !evidenceValidUntil) {
      setError(t("capEvidenceExpiryRequired"));
      return;
    }
    const form = new FormData();
    form.append("category", evidenceCategory);
    form.append("title", evidenceTitle.trim());
    if (evidenceValidUntil) form.append("validUntil", evidenceValidUntil);
    form.append("noExpiry", evidenceNoExpiry ? "1" : "0");
    if (evidenceFile) form.append("file", evidenceFile);
    setSavingEvidence(true);
    try {
      await api("/api/user/enterprise/evidence", { method: "POST", body: form });
      setEvidenceTitle("");
      setEvidenceFile(null);
      setEvidenceValidUntil("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capUploadFailed"));
    } finally {
      setSavingEvidence(false);
    }
  };

  const deleteEvidence = async (id: number) => {
    setError(null);
    try {
      await api(`/api/user/enterprise/evidence/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capDeleteFailed"));
    }
  };

  /** 证据文件走鉴权路由：带 Bearer 拉 Blob 后新窗口打开（<a> 无法附加 Authorization） */
  const openEvidenceFile = async (url: string) => {
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(t("capFileOpenFailedStatus", { status: res.status }));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("capFileOpenFailed"));
    }
  };

  if (!enabled) return null;

  return (
    <section className="rounded-xl border border-border bg-white p-4 space-y-4" data-testid="enterprise-capability-section">
      <div>
        <h3 className="text-sm font-bold text-foreground">{t("capSectionTitle")}</h3>
        <p className="text-2xs text-muted-foreground mt-0.5">
          {t("capSectionDesc")}
        </p>
      </div>

      <DataState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        errorText={error ?? undefined}
        retryText={t("capRetry")}
        skeleton={<p className="text-xs text-muted-foreground" aria-busy="true">{t("capLoading")}</p>}
        className="space-y-3"
      >
        <>
      {/* 能力列表 */}
      {profile && profile.capabilities.length > 0 && (
        <ul className="space-y-1.5">
          {profile.capabilities.map((capability) => (
            <li key={capability.id} className="flex items-start justify-between gap-2 rounded-md bg-secondary-50 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">
                  <span className="mr-1.5 rounded bg-brand-50 px-1 py-0.5 text-2xs text-brand-700">{t(TYPE_LABEL_KEYS[capability.type])}</span>
                  {capability.name}
                </p>
                <p className="mt-0.5 text-2xs text-muted-foreground break-words">{capabilitySummary(capability, t)}</p>
              </div>
              <button type="button" onClick={() => void deleteCapability(capability.id)} className="text-muted-foreground hover:text-rose-600 shrink-0" aria-label={t("capDeleteItemAria")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 新增能力 */}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={capType} onChange={(e) => { setCapType(e.target.value as CapabilityType); setFields({ noExpiry: true }); }} className={inputCls}>
            {(Object.keys(TYPE_LABEL_KEYS) as CapabilityType[]).map((type) => (
              <option key={type} value={type}>{t(TYPE_LABEL_KEYS[type])}</option>
            ))}
          </select>
          <input value={capName} onChange={(e) => setCapName(e.target.value)} placeholder={t("capNamePlaceholder")} className={inputCls} />
        </div>

        {capType === "certification" && (
          <div className="grid grid-cols-3 gap-2">
            <input value={String(fields.code ?? "")} onChange={(e) => setField("code", e.target.value)} placeholder={t("capCertCodePlaceholder")} className={inputCls} />
            <input type="date" value={String(fields.validUntil ?? "")} onChange={(e) => setField("validUntil", e.target.value)} className={inputCls} disabled={fields.noExpiry === true} />
            <label className="flex items-center gap-1 text-2xs text-muted-foreground">
              <input type="checkbox" checked={fields.noExpiry === true} onChange={(e) => setField("noExpiry", e.target.checked)} />
              {t("capNoExpiry")}
            </label>
          </div>
        )}
        {capType === "experience" && (
          <div className="grid grid-cols-3 gap-2">
            <input value={String(fields.count ?? "")} onChange={(e) => setField("count", e.target.value)} placeholder={t("capExpCountPlaceholder")} className={inputCls} />
            <input value={String(fields.years ?? "")} onChange={(e) => setField("years", e.target.value)} placeholder={t("capExpYearsPlaceholder")} className={inputCls} />
            <input value={String(fields.similarScope ?? "")} onChange={(e) => setField("similarScope", e.target.value)} placeholder={t("capExpScopePlaceholder")} className={inputCls} />
          </div>
        )}
        {capType === "financial" && (
          <div className="grid grid-cols-3 gap-2">
            <input value={String(fields.metric ?? "")} onChange={(e) => setField("metric", e.target.value)} placeholder={t("capFinMetricPlaceholder")} className={inputCls} />
            <input value={String(fields.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder={t("capFinValuePlaceholder")} className={inputCls} />
            <input value={String(fields.year ?? "")} onChange={(e) => setField("year", e.target.value)} placeholder={t("capFinYearPlaceholder")} className={inputCls} />
          </div>
        )}
        {capType === "personnel" && (
          <div className="grid grid-cols-2 gap-2">
            <input value={String(fields.role ?? "")} onChange={(e) => setField("role", e.target.value)} placeholder={t("capPerRolePlaceholder")} className={inputCls} />
            <input value={String(fields.count ?? "")} onChange={(e) => setField("count", e.target.value)} placeholder={t("capPerCountPlaceholder")} className={inputCls} />
          </div>
        )}
        {capType === "localization" && (
          <div className="space-y-2">
            <input value={String(fields.country ?? "")} onChange={(e) => setField("country", e.target.value)} placeholder={t("capLocCountryPlaceholder")} className={inputCls} />
            <div className="flex gap-4 text-2xs text-muted-foreground">
              <label className="flex items-center gap-1"><input type="checkbox" checked={fields.hasLocalOffice === true} onChange={(e) => setField("hasLocalOffice", e.target.checked)} />{t("capLocalOffice")}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={fields.hasLocalAgent === true} onChange={(e) => setField("hasLocalAgent", e.target.checked)} />{t("capLocalAgent")}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={fields.hasLocalTaxId === true} onChange={(e) => setField("hasLocalTaxId", e.target.checked)} />{t("capLocalTaxId")}</label>
            </div>
          </div>
        )}
        {capType === "registration" && (
          <div className="grid grid-cols-2 gap-2">
            <input value={String(fields.platform ?? "")} onChange={(e) => setField("platform", e.target.value)} placeholder={t("capRegPlatformPlaceholder")} className={inputCls} />
            <input value={String(fields.status ?? "")} onChange={(e) => setField("status", e.target.value)} placeholder={t("capRegStatusPlaceholder")} className={inputCls} />
          </div>
        )}
        {capType === "technical" && (
          <div className="grid grid-cols-3 gap-2">
            <input value={String(fields.parameter ?? "")} onChange={(e) => setField("parameter", e.target.value)} placeholder={t("capTechParamPlaceholder")} className={inputCls} />
            <input value={String(fields.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder={t("capTechValuePlaceholder")} className={inputCls} />
            <input value={String(fields.unit ?? "")} onChange={(e) => setField("unit", e.target.value)} placeholder={t("capTechUnitPlaceholder")} className={inputCls} />
          </div>
        )}
        {capType === "text" && (
          <input value={String(fields.text ?? "")} onChange={(e) => setField("text", e.target.value)} placeholder={t("capTextPlaceholder")} className={inputCls} />
        )}

        <button type="button" onClick={() => void submitCapability()} disabled={savingCap} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300">
          <Plus className="h-3.5 w-3.5" />
          {savingCap ? t("capSaving") : t("capAddItem")}
        </button>
      </div>

      {/* 证据资料 */}
      <div className="border-t border-border pt-3 space-y-2">
        <h4 className="text-xs font-bold text-foreground">{t("capEvidenceSectionTitle")}</h4>

        {profile && profile.evidence.length > 0 && (
          <ul className="space-y-1.5">
            {profile.evidence.map((evidence) => (
              <li key={evidence.id} className="flex items-start justify-between gap-2 rounded-md bg-secondary-50 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">{evidence.title}</p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {EVIDENCE_LABEL_KEYS[evidence.category] ? t(EVIDENCE_LABEL_KEYS[evidence.category]) : evidence.category}
                    {evidence.hasFile ? ` · ${t("capHasFile")}` : ` · ${t("capRegisteredOnly")}`}
                    {evidence.noExpiry ? ` · ${t("capNoExpiry")}` : evidence.validUntil ? ` · ${t("capValidUntil", { date: evidence.validUntil })}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {evidence.downloadUrl && (
                    <button type="button" onClick={() => void openEvidenceFile(evidence.downloadUrl as string)} className="text-muted-foreground hover:text-brand-700" aria-label={t("capViewEvidenceAria")}>
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => void deleteEvidence(evidence.id)} className="text-muted-foreground hover:text-rose-600" aria-label={t("capDeleteEvidenceAria")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={evidenceCategory} onChange={(e) => setEvidenceCategory(e.target.value)} className={inputCls}>
              {Object.entries(EVIDENCE_LABEL_KEYS).map(([value, key]) => (
                <option key={value} value={value}>{t(key)}</option>
              ))}
            </select>
            <input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} placeholder={t("capEvidenceNamePlaceholder")} aria-label={t("capEvidenceNamePlaceholder")} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <input type="file" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} aria-label={t("capUploadEvidence")} className="col-span-2 text-2xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-2xs file:font-bold file:text-brand-700" />
            <input type="date" value={evidenceValidUntil} onChange={(e) => setEvidenceValidUntil(e.target.value)} aria-label={t("capValidUntil")} className={inputCls} disabled={evidenceNoExpiry} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1 text-2xs text-muted-foreground">
              <input type="checkbox" checked={evidenceNoExpiry} onChange={(e) => setEvidenceNoExpiry(e.target.checked)} />
              {t("capNoExpiry")}
            </label>
            <button type="button" onClick={() => void submitEvidence()} disabled={savingEvidence} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300">
              <Upload className="h-3.5 w-3.5" />
              {savingEvidence ? t("capUploading") : t("capUploadEvidence")}
            </button>
          </div>
        </div>
      </div>
        </>
      </DataState>
    </section>
  );
}
