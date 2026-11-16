"use client";

/**
 * 采购认证要求编辑器（F02 第 3 页）
 *
 * @description 复用 /api/certifications 字典（与能力档案同一份），分组下拉选中一项即生成
 *              一张卡片；字典未收录的走“其他（自输入）”。每条要求可设强制/加分、适用范围、
 *              是否要求供应商证书在有效期内。
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/core/i18n";
import { fetchCertificationOptions, type CertificationOption } from "./api";
import {
  CERT_CATEGORY_ORDER,
  CERT_REQUIREMENT_MAX,
  CERT_REQUIREMENT_NOTE_MAX,
  type CertRequirement,
} from "@/shared/constants/procurement-cert-requirements";

const CATEGORY_KEYS: Record<string, string> = {
  management: "pc_cert_cat_management",
  industry: "pc_cert_cat_industry",
  market_access: "pc_cert_cat_market_access",
  product_safety: "pc_cert_cat_product_safety",
  esg: "pc_cert_cat_esg",
};

const inputCls =
  "w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-800 outline-none focus:border-teal-500";

export function CertRequirementsEditor({
  value,
  onChange,
}: {
  value: CertRequirement[];
  onChange: (next: CertRequirement[]) => void;
}) {
  const { t } = useLocale();
  const [options, setOptions] = useState<CertificationOption[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCertificationOptions()
      .then((items) => {
        if (!cancelled) setOptions(items);
      })
      .catch(() => {
        // 字典不可用时仍允许“其他（自输入）”，不阻断填写
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(
    () =>
      CERT_CATEGORY_ORDER.map((category) => ({
        category,
        items: options.filter((o) => o.category === category),
      })).filter((g) => g.items.length > 0),
    [options],
  );

  const patch = (index: number, next: Partial<CertRequirement>) => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...next } : item)));
  };

  const add = (raw: string) => {
    setError("");
    if (!raw) return;
    if (value.length >= CERT_REQUIREMENT_MAX) {
      setError(t("pc_cert_max"));
      return;
    }
    if (raw === "__manual__") {
      onChange([
        ...value,
        { code: "", name: "", custom: true, mandatory: true, note: "", requireValid: false },
      ]);
      return;
    }
    const option = options.find((o) => o.code === raw);
    if (!option) return;
    if (value.some((item) => item.code === option.code)) {
      setError(t("pc_cert_dup"));
      return;
    }
    onChange([
      ...value,
      {
        code: option.code,
        name: option.name,
        custom: false,
        mandatory: true,
        note: "",
        requireValid: false,
      },
    ]);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-secondary-600">{t("pc_cert_title")}</div>
        <span className="text-[11px] text-secondary-400">{value.length}/{CERT_REQUIREMENT_MAX}</span>
      </div>
      <select
        value=""
        onChange={(e) => add(e.target.value)}
        className={inputCls}
        aria-label={t("pc_cert_select")}
      >
        <option value="">{t("pc_cert_select")}</option>
        {grouped.map((group) => (
          <optgroup key={group.category} label={t(CATEGORY_KEYS[group.category] ?? group.category)}>
            {group.items.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__manual__">{t("pc_cert_other")}</option>
      </select>
      <p className="text-[11px] leading-relaxed text-secondary-400">{t("pc_cert_hint")}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-secondary-300 px-3 py-4 text-center text-xs text-secondary-400">
          {t("pc_cert_empty")}
        </p>
      ) : (
        <div className="grid gap-2">
          {value.map((item, index) => (
            <div key={`${item.code || "custom"}-${index}`} className="rounded-xl border border-secondary-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                {item.custom ? (
                  <input
                    value={item.name}
                    onChange={(e) => patch(index, { name: e.target.value })}
                    placeholder={t("pc_cert_custom_ph")}
                    className={inputCls}
                    aria-label={t("pc_cert_custom_ph")}
                  />
                ) : (
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-secondary-900">{item.name}</div>
                    <div className="mt-0.5 text-[11px] text-secondary-400">{item.code}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                >
                  {t("pc_cert_remove")}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-secondary-300">
                  <button
                    type="button"
                    onClick={() => patch(index, { mandatory: true })}
                    className={`px-3 py-1 text-xs font-semibold ${item.mandatory ? "bg-teal-600 text-white" : "bg-white text-secondary-600"}`}
                  >
                    {t("pc_cert_mandatory")}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(index, { mandatory: false })}
                    className={`px-3 py-1 text-xs font-semibold ${!item.mandatory ? "bg-teal-600 text-white" : "bg-white text-secondary-600"}`}
                  >
                    {t("pc_cert_preferred")}
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-secondary-600">
                  <input
                    type="checkbox"
                    checked={item.requireValid}
                    onChange={(e) => patch(index, { requireValid: e.target.checked })}
                  />
                  {t("pc_cert_require_valid")}
                </label>
              </div>

              <input
                value={item.note}
                onChange={(e) => patch(index, { note: e.target.value.slice(0, CERT_REQUIREMENT_NOTE_MAX) })}
                placeholder={t("pc_cert_note_ph")}
                maxLength={CERT_REQUIREMENT_NOTE_MAX}
                className={`${inputCls} mt-2`}
                aria-label={t("pc_cert_note_ph")}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
