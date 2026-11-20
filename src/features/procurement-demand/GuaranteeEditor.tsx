"use client";

/**
 * 保函/质保金编辑器（F02 商务条款）
 *
 * @description 类型用 chip 选择；选中后逐项填写形式、比例或金额、有效期/退还节点。
 */
import { useLocale } from "@/core/i18n";
import { Select } from "@/shared/ui";
import {
  GUARANTEE_BASES,
  GUARANTEE_FORMS,
  GUARANTEE_NOTE_MAX,
  GUARANTEE_TYPES,
  guaranteeDefault,
  type GuaranteeRequirement,
  type GuaranteeType,
} from "@/shared/constants/guarantees";

const inputCls =
  "w-full rounded-lg border border-secondary-300 bg-white px-2.5 py-1.5 text-xs text-secondary-800 outline-none focus:border-teal-500";

export function GuaranteeEditor({
  value,
  onChange,
}: {
  value: GuaranteeRequirement[];
  onChange: (next: GuaranteeRequirement[]) => void;
}) {
  const { t } = useLocale();

  const toggle = (type: GuaranteeType) => {
    if (value.some((item) => item.type === type)) {
      onChange(value.filter((item) => item.type !== type));
      return;
    }
    onChange([...value, guaranteeDefault(type)]);
  };

  const patch = (index: number, next: Partial<GuaranteeRequirement>) => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {GUARANTEE_TYPES.map((type) => {
          const selected = value.some((item) => item.type === type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                selected
                  ? "border-teal-600 bg-teal-50 text-teal-700"
                  : "border-secondary-300 text-secondary-600"
              }`}
            >
              {t(`pc_guar_${type}`)}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-secondary-400">{t("pc_guarantees_hint")}</p>

      {value.map((item, index) => (
        <div
          key={item.type}
          className="grid gap-2 rounded-lg border border-secondary-200 bg-white p-2 sm:grid-cols-[1.1fr_1fr_1.1fr_1.6fr_auto] sm:items-center"
        >
          {item.type === "other" ? (
            <input
              value={item.otherName}
              onChange={(e) => patch(index, { otherName: e.target.value })}
              placeholder={t("pc_guar_other_ph")}
              className={inputCls}
              aria-label={t("pc_guar_other")}
            />
          ) : (
            <span className="truncate text-xs font-semibold text-secondary-700">{t(`pc_guar_${item.type}`)}</span>
          )}

          <Select
            value={item.form}
            onChange={(e) => patch(index, { form: e.target.value as GuaranteeRequirement["form"] })}
            className={inputCls}
            aria-label={t("pc_guar_form")}
          >
            {GUARANTEE_FORMS.map((form) => (
              <option key={form} value={form}>{t(`pc_gform_${form}`)}</option>
            ))}
          </Select>

          <div className="flex items-center gap-1">
            <Select
              value={item.basis}
              onChange={(e) => patch(index, { basis: e.target.value as GuaranteeRequirement["basis"] })}
              className={`${inputCls} w-24 shrink-0`}
              aria-label={t("pc_guar_basis")}
            >
              {GUARANTEE_BASES.map((basis) => (
                <option key={basis} value={basis}>{t(`pc_gbasis_${basis}`)}</option>
              ))}
            </Select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.value ?? ""}
              onChange={(e) => patch(index, { value: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder={item.basis === "percent" ? "%" : "0.00"}
              className={inputCls}
              aria-label={t("pc_guar_value")}
            />
          </div>

          <input
            value={item.note}
            onChange={(e) => patch(index, { note: e.target.value.slice(0, GUARANTEE_NOTE_MAX) })}
            placeholder={t("pc_guar_note_ph")}
            maxLength={GUARANTEE_NOTE_MAX}
            className={inputCls}
            aria-label={t("pc_guar_note")}
          />

          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={t("pc_guar_remove")}
            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
