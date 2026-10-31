"use client";
/**
 * 企业能力档案 + 证据资料库（企业设置页，v0.2）
 *
 * @module features/auth/components/EnterpriseCapabilitySection
 * @description 投标可行性报告的数据来源：企业自己维护「证书/业绩/财务/人员/本地化/注册/技术」
 *              能力项，并上传证据文件（PDF/图片/Office/zip，≤10MB）。
 *              能力项写入 enterprise_capability_items；证据 = upload_files 字节 + enterprise_evidence 元数据。
 *
 *              2026-10-31 组件化拆分（原 427 行四合一 → 编排层）：
 *                - enterprise-capability/shared.ts           类型/字典/摘要
 *                - enterprise-capability/useEnterpriseCapabilityData.ts  数据域 Hook
 *                - enterprise-capability/CapabilityFormFields.tsx        按类型字段渲染
 *                - enterprise-capability/EvidencePanel.tsx               证据列表+上传表单
 *              本文件只留：Hook 装配 + 能力列表 + 新增能力容器 + 三态出口。
 */
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { DataState } from "@/shared/ui";
import { useEnterpriseCapabilityData } from "./enterprise-capability/useEnterpriseCapabilityData";
import { CapabilityFormFields } from "./enterprise-capability/CapabilityFormFields";
import { EvidencePanel } from "./enterprise-capability/EvidencePanel";
import { TYPE_LABEL_KEYS, capabilitySummary, inputCls, type CapabilityType } from "./enterprise-capability/shared";

export interface EnterpriseCapabilitySectionProps {
  /** 已绑定企业才渲染 */
  enabled: boolean;
}

export function EnterpriseCapabilitySection({ enabled }: EnterpriseCapabilitySectionProps) {
  const { t } = useLocale();
  const data = useEnterpriseCapabilityData(enabled);
  const {
    profile, loading, error, load,
    capType, setCapType, capName, setCapName, fields, setField, resetFields, savingCap, submitCapability, deleteCapability,
  } = data;

  if (!enabled) return null;

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
      {/* 能力列表 */}
      {profile && profile.capabilities.length > 0 && (
        <ul className="space-y-1.5">
          {profile.capabilities.map((capability) => (
            <li key={capability.id} className="flex items-start justify-between gap-2 rounded-md bg-secondary-50 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">
                  <span className="mr-1.5 rounded bg-brand-50 px-1 py-0.5 text-2xs text-brand-700">{t(TYPE_LABEL_KEYS[capability.type])}</span>
                  {capability.name}
                </p>
                <p className="mt-0.5 text-2xs text-muted-foreground break-words">{capabilitySummary(capability, t)}</p>
              </div>
              <button type="button" onClick={() => void deleteCapability(capability.id)} className="text-muted-foreground hover:text-rose-600 shrink-0" aria-label={t("capDeleteItemAria")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 新增能力 */}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={capType} onChange={(e) => { setCapType(e.target.value as CapabilityType); resetFields(); }} className={inputCls}>
            {(Object.keys(TYPE_LABEL_KEYS) as CapabilityType[]).map((type) => (
              <option key={type} value={type}>{t(TYPE_LABEL_KEYS[type])}</option>
            ))}
          </select>
          <input value={capName} onChange={(e) => setCapName(e.target.value)} placeholder={t("capNamePlaceholder")} className={inputCls} />
        </div>

        <CapabilityFormFields capType={capType} fields={fields} setField={setField} />

        <button type="button" onClick={() => void submitCapability()} disabled={savingCap} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300">
          <Plus className="h-3.5 w-3.5" />
          {savingCap ? t("capSaving") : t("capAddItem")}
        </button>
      </div>

      {/* 证据资料 */}
      <EvidencePanel data={data} />
        </>
      </DataState>
    </section>
  );
}
