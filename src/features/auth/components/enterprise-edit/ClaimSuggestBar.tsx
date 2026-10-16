"use client";

/**
 * 企业信息编辑表单 — 认领引导条（自 EnterpriseEditForm.tsx 拆出，JSX 逐字不变）。
 *
 * 展示组件：库内已有认证同名/近似企业时提示，提示但不阻断；
 * 建议查询（checkCompanySuggest）留在容器，本组件只管呈现与上抛。
 *
 * @module features/auth/components/enterprise-edit/ClaimSuggestBar
 */
import { memo } from "react";
import { useLocale } from "@/core/i18n";

/** 认领建议候选（/api/user/enterprise/suggest 返回，仅目录公开字段） */
export interface ClaimSuggestion {
  id: number;
  company: string;
  country: string | null;
  industry: string | null;
}

export const ClaimSuggestBar = memo(function ClaimSuggestBar({
  suggestions,
  onClaim,
  onDismiss,
}: {
  suggestions: ClaimSuggestion[];
  onClaim?: (supplier: { id: number; company: string }) => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-brand-700">
        {t("authEnterpriseClaimHint") || "供应商库中已存在以下已认证企业，认领通过后即可完成绑定："}
      </p>
      <ul className="space-y-1">
        {suggestions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-foreground truncate">
              {s.company}
              {s.country ? <span className="text-muted-foreground"> · {s.country}</span> : null}
              {s.industry ? <span className="text-muted-foreground"> · {s.industry}</span> : null}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0 cursor-pointer"
              onClick={() => onClaim?.({ id: Number(s.id), company: String(s.company ?? "") })}
            >
              {t("authEnterpriseClaimAction") || "去认领"}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        onClick={onDismiss}
      >
        {t("authEnterpriseClaimDismiss") || "都不是我的公司，继续填写"}
      </button>
    </div>
  );
});
