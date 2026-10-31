/**
 * 企业能力档案 — 按类型渲染的表单字段（自 EnterpriseCapabilitySection.tsx 拆出）
 *
 * @module features/auth/components/enterprise-capability/CapabilityFormFields
 * @description 八种能力类型各自的字段网格（证书/业绩/财务/人员/本地化/注册/技术/自由文本）。
 *              纯受控渲染：值与变更全部来自 props（fields/setField），不含提交逻辑。
 */
import { useLocale } from "@/core/i18n";
import { inputCls, type CapabilityType, type FieldValue } from "./shared";

export function CapabilityFormFields({
  capType,
  fields,
  setField,
}: {
  capType: CapabilityType;
  fields: Record<string, FieldValue>;
  setField: (key: string, value: FieldValue) => void;
}) {
  const { t } = useLocale();

  if (capType === "certification") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <input value={String(fields.code ?? "")} onChange={(e) => setField("code", e.target.value)} placeholder={t("capCertCodePlaceholder")} className={inputCls} />
        <input type="date" value={String(fields.validUntil ?? "")} onChange={(e) => setField("validUntil", e.target.value)} className={inputCls} disabled={fields.noExpiry === true} />
        <label className="flex items-center gap-1 text-2xs text-muted-foreground">
          <input type="checkbox" checked={fields.noExpiry === true} onChange={(e) => setField("noExpiry", e.target.checked)} />
          {t("capNoExpiry")}
        </label>
      </div>
    );
  }
  if (capType === "experience") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <input value={String(fields.count ?? "")} onChange={(e) => setField("count", e.target.value)} placeholder={t("capExpCountPlaceholder")} className={inputCls} />
        <input value={String(fields.years ?? "")} onChange={(e) => setField("years", e.target.value)} placeholder={t("capExpYearsPlaceholder")} className={inputCls} />
        <input value={String(fields.similarScope ?? "")} onChange={(e) => setField("similarScope", e.target.value)} placeholder={t("capExpScopePlaceholder")} className={inputCls} />
      </div>
    );
  }
  if (capType === "financial") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <input value={String(fields.metric ?? "")} onChange={(e) => setField("metric", e.target.value)} placeholder={t("capFinMetricPlaceholder")} className={inputCls} />
        <input value={String(fields.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder={t("capFinValuePlaceholder")} className={inputCls} />
        <input value={String(fields.year ?? "")} onChange={(e) => setField("year", e.target.value)} placeholder={t("capFinYearPlaceholder")} className={inputCls} />
      </div>
    );
  }
  if (capType === "personnel") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <input value={String(fields.role ?? "")} onChange={(e) => setField("role", e.target.value)} placeholder={t("capPerRolePlaceholder")} className={inputCls} />
        <input value={String(fields.count ?? "")} onChange={(e) => setField("count", e.target.value)} placeholder={t("capPerCountPlaceholder")} className={inputCls} />
      </div>
    );
  }
  if (capType === "localization") {
    return (
      <div className="space-y-2">
        <input value={String(fields.country ?? "")} onChange={(e) => setField("country", e.target.value)} placeholder={t("capLocCountryPlaceholder")} className={inputCls} />
        <div className="flex gap-4 text-2xs text-muted-foreground">
          <label className="flex items-center gap-1"><input type="checkbox" checked={fields.hasLocalOffice === true} onChange={(e) => setField("hasLocalOffice", e.target.checked)} />{t("capLocalOffice")}</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={fields.hasLocalAgent === true} onChange={(e) => setField("hasLocalAgent", e.target.checked)} />{t("capLocalAgent")}</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={fields.hasLocalTaxId === true} onChange={(e) => setField("hasLocalTaxId", e.target.checked)} />{t("capLocalTaxId")}</label>
        </div>
      </div>
    );
  }
  if (capType === "registration") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <input value={String(fields.platform ?? "")} onChange={(e) => setField("platform", e.target.value)} placeholder={t("capRegPlatformPlaceholder")} className={inputCls} />
        <input value={String(fields.status ?? "")} onChange={(e) => setField("status", e.target.value)} placeholder={t("capRegStatusPlaceholder")} className={inputCls} />
      </div>
    );
  }
  if (capType === "technical") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <input value={String(fields.parameter ?? "")} onChange={(e) => setField("parameter", e.target.value)} placeholder={t("capTechParamPlaceholder")} className={inputCls} />
        <input value={String(fields.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder={t("capTechValuePlaceholder")} className={inputCls} />
        <input value={String(fields.unit ?? "")} onChange={(e) => setField("unit", e.target.value)} placeholder={t("capTechUnitPlaceholder")} className={inputCls} />
      </div>
    );
  }
  return (
    <input value={String(fields.text ?? "")} onChange={(e) => setField("text", e.target.value)} placeholder={t("capTextPlaceholder")} className={inputCls} />
  );
}
