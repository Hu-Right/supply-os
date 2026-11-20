"use client";

/**
 * 采购认证要求编辑器（F02 第 3 页）
 *
 * @description 复用 /api/certifications 字典（与能力档案同一份），分组下拉选中一项即生成
 *              一枚胶囊；字典未收录的走“其他（自输入）”。胶囊上直接切换强制/加分。
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/core/i18n";
import { Select } from "@/shared/ui";
import { fetchCertificationOptions, type CertificationOption } from "./api";
import {
  CERT_CATEGORY_ORDER,
  CERT_REQUIREMENT_MAX,
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
      onChange([...value, { code: "", name: "", custom: true, mandatory: true }]);
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
      { code: option.code, name: option.name, custom: false, mandatory: true },
    ]);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-secondary-600">{t("pc_cert_title")}</div>
        <span className="text-[11px] text-secondary-400">{value.length}/{CERT_REQUIREMENT_MAX}</span>
      </div>
      <Select
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
      </Select>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-secondary-300 px-3 py-2 text-center text-xs text-secondary-400">
          {t("pc_cert_empty")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <span
              key={`${item.code || "custom"}-${index}`}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                item.mandatory
                  ? "border-teal-300 bg-teal-50 text-teal-800"
                  : "border-secondary-300 bg-white text-secondary-600"
              }`}
            >
              {item.custom ? (
                <input
                  value={item.name}
                  onChange={(e) => patch(index, { name: e.target.value })}
                  placeholder={t("pc_cert_custom_ph")}
                  className="w-36 min-w-20 bg-transparent text-xs outline-none placeholder:text-secondary-400"
                  aria-label={t("pc_cert_custom_ph")}
                />
              ) : (
                <span className="max-w-52 truncate" title={item.code}>
                  {item.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => patch(index, { mandatory: !item.mandatory })}
                title={`${t("pc_cert_mandatory")} / ${t("pc_cert_preferred")}`}
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  item.mandatory ? "bg-teal-600 text-white" : "bg-secondary-100 text-secondary-600"
                }`}
              >
                {item.mandatory ? t("pc_cert_mandatory") : t("pc_cert_preferred")}
              </button>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label={t("pc_cert_remove")}
                className="shrink-0 rounded-full px-1 text-secondary-400 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
