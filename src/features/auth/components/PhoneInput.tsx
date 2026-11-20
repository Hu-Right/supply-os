"use client";

/**
 * 手机号输入（国家/地区 + 本地号码）
 *
 * @module features/auth/components/PhoneInput
 * @description 注册 / 绑定 / 换绑共用：默认 +86，可切任意国家与地区（含港澳台）。
 *              对外只暴露 E.164（`+8613800138000`）：合法时才回调非空值，
 *              父组件据此做「是否可提交」判断；服务端仍会用 libphonenumber 复核。
 */
import { useMemo, useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { Input, Select } from "@/shared/ui";
import { useLocale } from "@/core/i18n";

/** 国家/地区列表（ISO2，按字母序；200+ 项用原生 select，无需搜索组件） */
const COUNTRY_CODES = getCountries().slice().sort();

export interface PhoneInputProps {
  /** E.164 或空串 */
  value: string;
  /** 仅在号码合法时回调 E.164，否则回调空串 */
  onChange: (e164: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PhoneInput({ value, onChange, placeholder, disabled, className }: PhoneInputProps) {
  const { locale, t } = useLocale();
  const initial = parsePhoneNumberFromString(value || "");
  const [country, setCountry] = useState<CountryCode>(initial?.country ?? "CN");
  const [national, setNational] = useState(initial?.nationalNumber ?? "");

  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  const commit = (nextNational: string, nextCountry: CountryCode) => {
    setNational(nextNational);
    setCountry(nextCountry);
    const parsed = parsePhoneNumberFromString(nextNational, nextCountry);
    onChange(parsed?.isValid() ? parsed.number : "");
  };

  return (
    <div className="flex gap-2">
      <Select
        aria-label={t("authPhoneCountryLabel") || "国家/地区"}
        value={country}
        disabled={disabled}
        onChange={(e) => commit("", e.target.value as CountryCode)}
        className="w-[8.5rem] shrink-0"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c} value={c}>
            {displayNames?.of(c) ?? c} +{getCountryCallingCode(c)}
          </option>
        ))}
      </Select>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={national}
        disabled={disabled}
        onChange={(e) => commit(e.target.value.replace(/[^\d\s-]/g, ""), country)}
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}