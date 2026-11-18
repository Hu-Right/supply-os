/**
 * 企业证据资料库面板（自 EnterpriseCapabilitySection.tsx 拆出）
 *
 * @module features/auth/components/enterprise-capability/EvidencePanel
 * @description 证据列表（类目/有效期）+ 登记表单（类目/标题/有效期）。
 *              2026-11-18 起证据改为**纯登记**：不再接收文件上传（文件字节存储、
 *              下载路由与「查看/上传」动作一并摘除），只保留元数据供可行性报告引用。
 *              纯视图：数据与动作全部来自 useEnterpriseCapabilityData 的返回（单个 data prop）。
 */
import { Trash2, Save } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { EVIDENCE_LABEL_KEYS, inputCls } from "./shared";
import type { EnterpriseCapabilityData } from "./useEnterpriseCapabilityData";

export function EvidencePanel({ data }: { data: EnterpriseCapabilityData }) {
  const { t } = useLocale();
  const {
    profile,
    evidenceCategory, setEvidenceCategory, evidenceTitle, setEvidenceTitle,
    evidenceValidUntil, setEvidenceValidUntil, evidenceNoExpiry, setEvidenceNoExpiry, savingEvidence,
    submitEvidence, deleteEvidence,
  } = data;

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <h4 className="text-xs font-bold text-foreground">{t("capEvidenceSectionTitle")}</h4>
      <p className="text-2xs leading-relaxed text-muted-foreground">{t("capEvidenceHint")}</p>

      {profile && profile.evidence.length > 0 && (
        <ul className="space-y-1.5">
          {profile.evidence.map((evidence) => (
            <li key={evidence.id} className="flex items-start justify-between gap-2 rounded-md bg-secondary-50 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">{evidence.title}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {EVIDENCE_LABEL_KEYS[evidence.category] ? t(EVIDENCE_LABEL_KEYS[evidence.category]) : evidence.category}
                  {evidence.noExpiry ? ` · ${t("capNoExpiry")}` : evidence.validUntil ? ` · ${t("capValidUntil", { date: evidence.validUntil })}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => void deleteEvidence(evidence.id)} className="text-muted-foreground hover:text-rose-600" aria-label={t("capDeleteEvidenceAria")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={evidenceCategory} onChange={(e) => setEvidenceCategory(e.target.value)} className={inputCls}>
            {Object.entries(EVIDENCE_LABEL_KEYS).map(([value, key]) => (
              <option key={value} value={value}>{t(key)}</option>
            ))}
          </select>
          <input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} placeholder={t("capEvidenceNamePlaceholder")} aria-label={t("capEvidenceNamePlaceholder")} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
          <input type="date" value={evidenceValidUntil} onChange={(e) => setEvidenceValidUntil(e.target.value)} aria-label={t("capValidUntil", { date: "" })} className={inputCls} disabled={evidenceNoExpiry} />
          <label className="flex items-center gap-1 text-2xs text-muted-foreground">
            <input type="checkbox" checked={evidenceNoExpiry} onChange={(e) => setEvidenceNoExpiry(e.target.checked)} />
            {t("capNoExpiry")}
          </label>
        </div>
        <div className="flex items-center justify-end">
          <button type="button" onClick={() => void submitEvidence()} disabled={savingEvidence} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300">
            <Save className="h-3.5 w-3.5" />
            {savingEvidence ? t("capSavingEvidence") : t("capSaveEvidence")}
          </button>
        </div>
      </div>
    </div>
  );
}
