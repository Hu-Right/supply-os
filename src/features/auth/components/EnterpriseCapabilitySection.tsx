"use client";
/**
 * 企业能力档案（企业设置页）—— 只收集「证书资质」
 *
 * @module features/auth/components/EnterpriseCapabilitySection
 * @description 2026-11-27 口径：能力档案只收集证书资质，证书一律从 150 条认证字典里选，
 *              写 `supplier.certification_tags` + `certification_meta`（唯一事实源）。
 *              业绩/财务/人员等非证书能力项暂不在此维护（数据保留，不再展示与新增）。
 *
 *              2026-10-31 组件化拆分（原 427 行四合一 → 编排层）：
 *                - enterprise-capability/shared.ts           类型/字典/摘要
 *                - enterprise-capability/useEnterpriseCapabilityData.ts  数据域 Hook
 *                - enterprise-capability/CapabilityFormFields.tsx        按类型字段渲染
 *              本文件只留：Hook 装配 + 证书列表 + 新增证书容器 + 三态出口。
 */
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { DataState } from "@/shared/ui";
import { useEnterpriseCapabilityData } from "./enterprise-capability/useEnterpriseCapabilityData";
import { CapabilityFormFields } from "./enterprise-capability/CapabilityFormFields";
import { capabilitySummary } from "./enterprise-capability/shared";

export interface EnterpriseCapabilitySectionProps {
  /** 已绑定企业才渲染 */
  enabled: boolean;
}

export function EnterpriseCapabilitySection({ enabled }: EnterpriseCapabilitySectionProps) {
  const { t } = useLocale();
  const data = useEnterpriseCapabilityData(enabled);
  const {
    profile, loading, error, actionError, load,
    setCapName, certOptions, fields, setField, savingCap, submitCapability, deleteCapability,
  } = data;

  if (!enabled) return null;

  // 只展示证书类能力项（非证书能力暂不维护）
  const certs = (profile?.capabilities ?? []).filter((c) => c.type === "certification");

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
          {/* 表单/动作错误：内联提示，保留列表与表单 */}
          {actionError && (
            <p
              role="alert"
              className="rounded-md border border-danger-200 bg-danger-50 px-2.5 py-2 text-xs font-medium text-danger-600"
            >
              {actionError}
            </p>
          )}

          {/* 已选证书列表 */}
          {certs.length > 0 && (
            <ul className="space-y-1.5">
              {certs.map((capability) => (
                <li key={capability.id} className="flex items-start justify-between gap-2 rounded-md bg-secondary-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">{capability.name}</p>
                    <p className="mt-0.5 text-2xs text-muted-foreground break-words">{capabilitySummary(capability, t)}</p>
                  </div>
                  <button type="button" onClick={() => void deleteCapability(capability.id)} className="text-muted-foreground hover:text-rose-600 shrink-0" aria-label={t("capDeleteItemAria")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 新增证书：只从 150 字典选，名称自动带入 */}
          <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
            <CapabilityFormFields capType="certification" fields={fields} setField={setField} certOptions={certOptions} setName={setCapName} />
            <button type="button" onClick={() => void submitCapability()} disabled={savingCap} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300">
              <Plus className="h-3.5 w-3.5" />
              {savingCap ? t("capSaving") : t("capAddItem")}
            </button>
          </div>
        </>
      </DataState>
    </section>
  );
}
