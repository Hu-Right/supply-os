/**
 * Step 3 — 发布设置：可见范围、供应商要求、附件占位、联系方式、发布承诺、确认摘要
 * @module features/rfq/components/RfqWizard/steps/Step3PublishSettings
 */
import { AlertTriangle, ChevronDown, Upload } from "lucide-react";
import { cn } from "@/shared/utils";
import { useLocale } from "@/core/i18n";
import { ChipToggleGroup, Input, SegmentedControl } from "@/shared/ui";
import { SUPPLIER_REQ_OPTIONS, SUPPLIER_REQ_LABEL_KEYS } from "../../../constants";
import type { FieldErrors, RfqFormState } from "../../../types";
import { Field } from "../ui/Field";
import { SummaryItem } from "../ui/SummaryItem";

export interface Step3Props {
  form: RfqFormState;
  errors: FieldErrors;
  update: <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => void;
  termsOpen: boolean;
  setTermsOpen: (open: boolean) => void;
  setStep: (step: number) => void;
  /** 已选 旧品类分类的中文名称（一级 / 二级），供发布前摘要核对 */
  categoryDisplay: string;
}

export function Step3PublishSettings({ form, errors, update, termsOpen, setTermsOpen, setStep, categoryDisplay }: Step3Props) {
  const { t } = useLocale();
  return (
    <div className="space-y-5">
      <Field label={t("rfqFieldVisibility")} required>
        <SegmentedControl items={[
            { value: "public", label: t("rfqVisibilityPublic") },
            { value: "targeted", label: t("rfqVisibilityTargeted") },
          ]} value={form.visibility}
          onChange={(v) => update("visibility", v)}
          fullWidth
        />
        <p className="text-2xs text-secondary-400 mt-1">
          {form.visibility === "public" ? t("rfqVisibilityPublicHint") : t("rfqVisibilityTargetedHint")}
        </p>
      </Field>

      <Field label={t("rfqFieldSupplierReqs")}>
        <ChipToggleGroup items={SUPPLIER_REQ_OPTIONS.map((s) => ({ value: s, label: t(SUPPLIER_REQ_LABEL_KEYS[s]) }))}
          selected={form.supplierReqs}
          onToggle={(v) => {
            const next = form.supplierReqs.includes(v)
              ? form.supplierReqs.filter((x) => x !== v)
              : [...form.supplierReqs, v];
            update("supplierReqs", next);
          }} />
      </Field>

      {/* 附件上传 — P2 接入 OSS 预签名直传 */}
      <div className="rounded-xl border border-dashed border-secondary-200 bg-secondary-50/30 p-6 text-center">
        <Upload className="w-8 h-8 text-secondary-300 mx-auto mb-2" />
        <p className="text-sm font-bold text-secondary-500">{t("rfqAttachmentComingSoon")}</p>
        <p className="text-2xs text-secondary-400 mt-1">{t("rfqAttachmentHint")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("rfqFieldContactName")} required error={errors.contactName} htmlFor="rfq-name">
          <Input id="rfq-name" value={form.contactName} error={!!errors.contactName}
            onChange={(e) => update("contactName", e.target.value)} placeholder={t("rfqContactNamePlaceholder")} />
        </Field>
        <Field label={t("rfqFieldContactEmail")} required error={errors.contactEmail} htmlFor="rfq-email">
          <Input id="rfq-email" type="email" value={form.contactEmail} error={!!errors.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)} placeholder={t("rfqContactEmailPlaceholder")} />
        </Field>
      </div>

      <Field label={t("rfqFieldContactPhone")}>
        <Input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)}
          placeholder={t("rfqContactPhonePlaceholder")} />
      </Field>

      {/* 发布承诺 */}
      <div className={cn(
        "rounded-xl border p-4",
        errors.agreed ? "border-rose-300 bg-rose-50/30" : "border-secondary-200 bg-secondary-50/50",
      )}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={form.agreed}
            onChange={(e) => update("agreed", e.target.checked)}
            className="mt-0.5 accent-teal-600" />
          <div className="flex-1">
            <button type="button" onClick={() => setTermsOpen(!termsOpen)}
              className="text-sm font-bold text-secondary-800 hover:text-teal-700 flex items-center gap-1">
              {t("rfqCommitmentAgree")}
              <ChevronDown className={cn("w-4 h-4 transition-transform", termsOpen && "rotate-180")} />
            </button>
            {termsOpen && (
              <ul className="mt-2 text-xs text-secondary-500 space-y-1 list-disc list-inside">
                <li>{t("rfqCommitmentItem1")}</li>
                <li>{t("rfqCommitmentItem2")}</li>
                <li>{t("rfqCommitmentItem3")}</li>
                <li>{t("rfqCommitmentItem4")}</li>
              </ul>
            )}
          </div>
        </label>
        {errors.agreed && (
          <p className="text-2xs text-rose-600 flex items-center gap-1 mt-2" data-error="true">
            <AlertTriangle className="w-3 h-3" /> {errors.agreed}
          </p>
        )}
      </div>

      {/* 发布前确认摘要 */}
      <div className="rounded-xl border border-secondary-200 bg-secondary-50/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-secondary-900">{t("rfqConfirmBeforePublish")}</h4>
          <span className="text-2xs text-secondary-400">{t("rfqConfirmEditHint")}</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <SummaryItem label={t("rfqFieldTitle")} value={form.title} onEdit={() => setStep(0)} />
          <SummaryItem label={t("rfqSummaryCategory")} value={categoryDisplay} onEdit={() => setStep(0)} />
          <SummaryItem label={t("rfqSummaryBudget")} value={form.budgetConfidential ? t("rfqConfidential") : form.budget ? t("rfqBudgetWan", { budget: form.budget }) : ""} onEdit={() => setStep(1)} />
          <SummaryItem label={t("rfqFieldAddress")} value={form.address} onEdit={() => setStep(1)} />
          <SummaryItem label={t("rfqSummaryDeadline")} value={form.deadline || ""} onEdit={() => setStep(1)} />
          <SummaryItem label={t("rfqFieldVisibility")} value={form.visibility === "public" ? t("rfqVisibilityPublic") : t("rfqVisibilityTargeted")} onEdit={() => setStep(2)} />
          <SummaryItem label={t("rfqSummaryAttachments")} value={form.attachments.length ? t("rfqFileCount", { count: form.attachments.length }) : ""} onEdit={() => setStep(2)} />
          <SummaryItem label={t("rfqSummaryContact")} value={form.contactName || form.contactEmail || ""} onEdit={() => setStep(2)} />
        </dl>
      </div>
    </div>
  );
}
