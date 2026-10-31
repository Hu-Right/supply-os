/**
 * 企业证据资料库面板（自 EnterpriseCapabilitySection.tsx 拆出）
 *
 * @module features/auth/components/enterprise-capability/EvidencePanel
 * @description 证据列表（类目/有效期/有无文件）+ 上传表单（类目/标题/文件/有效期）。
 *              纯视图：数据与动作全部来自 useEnterpriseCapabilityData 的返回（单个 data prop）。
 *              文件打开走鉴权 Blob（openEvidenceFile 在 hook 内，<a> 无法附加 Authorization）。
 */
import { Eye, Trash2, Upload } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { EVIDENCE_LABEL_KEYS, inputCls } from "./shared";
import type { EnterpriseCapabilityData } from "./useEnterpriseCapabilityData";

export function EvidencePanel({ data }: { data: EnterpriseCapabilityData }) {
  const { t } = useLocale();
  const {
    profile,
    evidenceFile, setEvidenceFile, evidenceCategory, setEvidenceCategory, evidenceTitle, setEvidenceTitle,
    evidenceValidUntil, setEvidenceValidUntil, evidenceNoExpiry, setEvidenceNoExpiry, savingEvidence,
    submitEvidence, deleteEvidence, openEvidenceFile,
  } = data;

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <h4 className="text-xs font-bold text-foreground">{t("capEvidenceSectionTitle")}</h4>

      {profile && profile.evidence.length > 0 && (
        <ul className="space-y-1.5">
          {profile.evidence.map((evidence) => (
            <li key={evidence.id} className="flex items-start justify-between gap-2 rounded-md bg-secondary-50 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">{evidence.title}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {EVIDENCE_LABEL_KEYS[evidence.category] ? t(EVIDENCE_LABEL_KEYS[evidence.category]) : evidence.category}
                  {evidence.hasFile ? ` · ${t("capHasFile")}` : ` · ${t("capRegisteredOnly")}`}
                  {evidence.noExpiry ? ` · ${t("capNoExpiry")}` : evidence.validUntil ? ` · ${t("capValidUntil", { date: evidence.validUntil })}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {evidence.downloadUrl && (
                  <button type="button" onClick={() => void openEvidenceFile(evidence.downloadUrl as string)} className="text-muted-foreground hover:text-brand-700" aria-label={t("capViewEvidenceAria")}>
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => void deleteEvidence(evidence.id)} className="text-muted-foreground hover:text-rose-600" aria-label={t("capDeleteEvidenceAria")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={evidenceCategory} onChange={(e) => setEvidenceCategory(e.target.value)} className={inputCls}>
            {Object.entries(EVIDENCE_LABEL_KEYS).map(([value, key]) => (
              <option key={value} value={value}>{t(key)}</option>
            ))}
          </select>
          <input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} placeholder={t("capEvidenceNamePlaceholder")} aria-label={t("capEvidenceNamePlaceholder")} className={inputCls} />
        </div>
        <div className="grid grid-cols-3 items-center gap-2">
          <input type="file" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} aria-label={t("capUploadEvidence")} className="col-span-2 text-2xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-2xs file:font-bold file:text-brand-700" />
          <input type="date" value={evidenceValidUntil} onChange={(e) => setEvidenceValidUntil(e.target.value)} aria-label={t("capValidUntil")} className={inputCls} disabled={evidenceNoExpiry} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1 text-2xs text-muted-foreground">
            <input type="checkbox" checked={evidenceNoExpiry} onChange={(e) => setEvidenceNoExpiry(e.target.checked)} />
            {t("capNoExpiry")}
          </label>
          <button type="button" onClick={() => void submitEvidence()} disabled={savingEvidence} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:bg-slate-300">
            <Upload className="h-3.5 w-3.5" />
            {savingEvidence ? t("capUploading") : t("capUploadEvidence")}
          </button>
        </div>
      </div>
    </div>
  );
}
