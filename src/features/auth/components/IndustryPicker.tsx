/**
 * 所属行业选择器（UGT-I 行业树，关键词推断）
 *
 * @module features/auth/components/IndustryPicker
 * @description 与「主营品目」选择器同一交互范式：输入关键词 → 推断候选 → 用户点选确认。
 *              行业是单值（supplier.industry_code），因此只有「选中 / 清除」两个动作；
 *              候选必须显式点选，不自动回填（低置信推断会污染行业归类）。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Tag, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Input } from "@/shared/ui";
import { fetchIndustryInfer, type IndustryBrief } from "@/core/api/industryInfer";

const inputCls =
  "w-full px-2 py-1.5 rounded border border-border bg-white text-xs text-foreground focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none";

export interface IndustryPickerProps {
  value: IndustryBrief | null;
  onChange: (next: IndustryBrief | null) => void;
}

export function IndustryPicker({ value, onChange }: IndustryPickerProps) {
  const { t, locale } = useLocale();
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<IndustryBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const kw = keyword.trim();
    if (kw.length < 1) {
      setCandidates([]);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchIndustryInfer(kw)
        .then((res) => {
          if (seq !== seqRef.current) return;
          setCandidates(Array.isArray(res?.candidates) ? res.candidates : []);
        })
        .catch(() => {
          if (seq === seqRef.current) setCandidates([]);
        })
        .finally(() => {
          if (seq === seqRef.current) {
            setLoading(false);
            setTouched(true);
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const nameOf = (item: IndustryBrief) =>
    locale === "zh" ? item.nameZh || item.nameEn : item.nameEn || item.nameZh;

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
              <Tag className="h-3.5 w-3.5" />
              {nameOf(value)}
              <span className="font-mono text-2xs font-normal text-teal-600">{value.code}</span>
            </p>
            {value.path && value.path.length > 1 && (
              <p className="mt-0.5 truncate text-2xs text-teal-700/80">{value.path.join(" / ")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setKeyword("");
              setCandidates([]);
            }}
            className="shrink-0 rounded p-1 text-teal-700/70 hover:bg-teal-100 hover:text-teal-800"
            aria-label={t("authEnterpriseIndustryClear") || "清除"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-2xs text-muted-foreground">
          {t("authEnterpriseIndustryHint") || "输入关键词（如 光伏、物流）从行业树里选一个，用于行业归类与筛选"}
        </p>
      )}

      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("authEnterpriseIndustryPlaceholder") || "输入行业关键词"}
          className={inputCls}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setKeyword((k) => k.trim())}
          className="shrink-0 px-2.5 py-1.5"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </div>

      {keyword.trim().length > 0 && (
        <div className="rounded-lg border border-border bg-white">
          {loading ? (
            <p className="px-3 py-2 text-2xs text-muted-foreground">{t("authEnterpriseIndustrySearching") || "匹配中…"}</p>
          ) : candidates.length === 0 ? (
            touched && (
              <p className="px-3 py-2 text-2xs text-muted-foreground">
                {t("authEnterpriseIndustryEmpty") || "没有匹配的行业，换个词试试"}
              </p>
            )
          ) : (
            <ul className="max-h-56 overflow-auto py-1">
              {candidates.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setKeyword("");
                      setCandidates([]);
                      setTouched(false);
                    }}
                    className="flex w-full items-start justify-between gap-3 px-3 py-1.5 text-left hover:bg-secondary-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">{nameOf(item)}</span>
                      {item.path && item.path.length > 1 && (
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          {item.path.join(" / ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground">{item.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}