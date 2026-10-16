"use client";

/**
 * 企业信息编辑表单 — 表格化字段组（自 EnterpriseEditForm.tsx 拆出，JSX 逐字不变）。
 *
 * 展示组件：values 与写回回调由容器持有；「两列一行 + full 独占一行」的排布规则在此实现。
 * 必填星号集合直接从 REQUIRED_KEYS 派生（字段定义即唯一事实源，不经 props 传递）。
 *
 * @module features/auth/components/enterprise-edit/FieldGrid
 */
import { memo } from "react";
import { useLocale } from "@/core/i18n";
import { inputCls, REQUIRED_KEYS, type FieldDef } from "./fields";

/** 分组标题：左侧色条 + 文本 */
export const GroupTitle = memo(function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-4 rounded bg-brand-500" />
      <h3 className="text-sm font-medium text-foreground">{children}</h3>
    </div>
  );
});

export const FieldGrid = memo(function FieldGrid({
  fields,
  values,
  onSet,
  onCompanyBlur,
}: {
  fields: FieldDef[];
  values: Record<string, string>;
  onSet: (key: string, v: string) => void;
  /** company 字段失焦回调（认领建议查询），其余字段不挂 */
  onCompanyBlur?: () => void;
}) {
  const { t } = useLocale();
  // 必填字段 Set（用于 label 星号标识）
  const requiredKeys = new Set(REQUIRED_KEYS.map((r) => r.key));

  const renderField = (f: FieldDef) => {
    const ph = f.placeholderKey ? (t(f.placeholderKey) || f.placeholder || "") : (f.placeholder || "");
    const isRequired = requiredKeys.has(f.key);
    return (
      <div key={f.key} className="contents">
        <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border flex items-center">
          {t(f.labelKey) || f.fallback}
          {isRequired && <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>}
        </div>
        <div className={`px-3 py-2 ${f.full ? "col-span-3" : "col-span-1"}`}>
          {f.textarea ? (
            <textarea
              className={`${inputCls} min-h-16 resize-y`}
              value={values[f.key] || ""}
              onChange={(e) => onSet(f.key, e.target.value)}
              placeholder={ph}
            />
          ) : f.options ? (
            <select
              className={inputCls}
              value={values[f.key] || ""}
              onChange={(e) => onSet(f.key, e.target.value)}
            >
              <option value="">{t("authEnterpriseSelectPlaceholder") || "请选择"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey) || o.fallback}</option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              value={values[f.key] || ""}
              onChange={(e) => onSet(f.key, e.target.value)}
              onBlur={f.key === "company" ? onCompanyBlur : undefined}
              placeholder={ph}
            />
          )}
        </div>
      </div>
    );
  };

  const rows: React.ReactNode[] = [];
  let cur: FieldDef[] = [];
  const flush = () => {
    if (!cur.length) return;
    const rowFields = cur;
    rows.push(
      <div key={`r-${rowFields[0].key}`} className="grid grid-cols-4 border-b border-border">
        {rowFields.map(renderField)}
        {rowFields.length === 1 && !rowFields[0].full && (
          <>
            <div className="bg-secondary-50 px-3 py-2 border-r border-border" />
            <div className="px-3 py-2" />
          </>
        )}
      </div>,
    );
    cur = [];
  };
  for (const f of fields) {
    if (f.full) { flush(); rows.push(<div key={`f-${f.key}`} className="grid grid-cols-4 border-b border-border">{renderField(f)}</div>); }
    else { cur.push(f); if (cur.length === 2) flush(); }
  }
  flush();
  return (
    <div className="border border-border rounded-md overflow-hidden bg-white">
      {rows}
    </div>
  );
});
