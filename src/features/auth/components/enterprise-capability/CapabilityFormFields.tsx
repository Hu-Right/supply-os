/**
 * 企业能力档案 — 按类型渲染的表单字段（自 EnterpriseCapabilitySection.tsx 拆出）
 *
 * @module features/auth/components/enterprise-capability/CapabilityFormFields
 * @description 八种能力类型各自的字段网格（证书/业绩/财务/人员/本地化/注册/技术/自由文本）。
 *              纯受控渲染：值与变更全部来自 props（fields/setField），不含提交逻辑。
 */
import { useLocale } from "@/core/i18n";
import {
  CERT_CATEGORY_LABEL_KEYS,
  CERT_CATEGORY_ORDER,
  inputCls,
  type CapabilityType,
  type CertOption,
  type FieldValue,
} from "./shared";

export function CapabilityFormFields({
  capType,
  fields,
  setField,
  certOptions = [],
  setName,
}: {
  capType: CapabilityType;
  fields: Record<string, FieldValue>;
  setField: (key: string, value: FieldValue) => void;
  /** 认证字典选项：为空（加载失败）时自动降级为手填输入框 */
  certOptions?: CertOption[];
  /** 选中字典项后回填能力项名称，避免用户手抄 */
  setName?: (name: string) => void;
}) {
  const { t } = useLocale();

  if (capType === "certification") {
    const dateAndExpiry = (
      <>
        <input type="date" value={String(fields.validUntil ?? "")} onChange={(e) => setField("validUntil", e.target.value)} className={inputCls} disabled={fields.noExpiry === true} />
        <label className="flex items-center gap-1 text-2xs text-muted-foreground">
          <input type="checkbox" checked={fields.noExpiry === true} onChange={(e) => setField("noExpiry", e.target.checked)} />
          {t("capNoExpiry")}
        </label>
      </>
    );

    // 字典不可用：退回自由输入，保证仍能录入
    if (certOptions.length === 0) {
      return (
        <div className="grid grid-cols-3 gap-2">
          <input value={String(fields.code ?? "")} onChange={(e) => setField("code", e.target.value)} placeholder={t("capCertCodePlaceholder")} className={inputCls} />
          {dateAndExpiry}
        </div>
      );
    }

    const knownCodes = new Set(certOptions.map((o) => o.code));
    const currentCode = String(fields.code ?? "");
    const isManual = fields.certManual === true || (currentCode !== "" && !knownCodes.has(currentCode));
    const grouped = CERT_CATEGORY_ORDER
      .map((cat) => ({ cat, items: certOptions.filter((o) => o.category === cat) }))
      .filter((g) => g.items.length > 0);

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <select
            value={isManual ? "__manual__" : currentCode}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__manual__") {
                setField("certManual", true);
                setField("code", "");
                return;
              }
              setField("certManual", false);
              setField("code", v);
              const opt = certOptions.find((o) => o.code === v);
              if (opt && setName) setName(opt.name);
            }}
            className={inputCls}
            aria-label={t("capCertSelectPlaceholder")}
          >
            <option value="">{t("capCertSelectPlaceholder")}</option>
            {grouped.map((g) => (
              <optgroup key={g.cat} label={t(CERT_CATEGORY_LABEL_KEYS[g.cat] ?? g.cat)}>
                {g.items.map((o) => (
                  <option key={o.id} value={o.code}>{o.name}</option>
                ))}
              </optgroup>
            ))}
            <option value="__manual__">{t("capCertOther")}</option>
          </select>
          {dateAndExpiry}
        </div>
        {isManual && (
          <input
            value={currentCode}
            onChange={(e) => setField("code", e.target.value)}
            placeholder={t("capCertCodePlaceholder")}
            className={inputCls}
          />
        )}
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
