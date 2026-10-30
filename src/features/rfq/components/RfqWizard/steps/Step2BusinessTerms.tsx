/**
 * Step 2 — 商务条款：预算、交付地点（手动填写）、贸易术语、付款方式、报价截止
 * @module features/rfq/components/RfqWizard/steps/Step2BusinessTerms
 */
import { ChipToggleGroup, Input, Select, Textarea } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import {
  CURRENCY_OPTIONS, INCOTERM_OPTIONS, PAYMENT_OPTIONS, PAYMENT_LABEL_KEYS,
} from "../../../constants";
import type { FieldErrors, RfqFormState } from "../../../types";
import { tomorrowIso } from "../utils";
import { Field } from "../ui/Field";

export interface Step2Props {
  form: RfqFormState;
  errors: FieldErrors;
  update: <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => void;
}

export function Step2BusinessTerms({ form, errors, update }: Step2Props) {
  const { t } = useLocale();
  return (
    <div className="space-y-5">
      <Field label={t("rfqFieldBudget")} required={!form.budgetConfidential} error={errors.budget}
        hint={t("rfqBudgetHint")}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input inputMode="decimal" value={form.budget} error={!!errors.budget} disabled={form.budgetConfidential}
            onChange={(e) => update("budget", e.target.value)} placeholder={t("rfqBudgetPlaceholder")} />
          <Select value={form.currency} disabled={form.budgetConfidential}
            onChange={(e) => update("currency", e.target.value)}>
            {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-secondary-600 cursor-pointer sm:col-span-2">
            <input type="checkbox" checked={form.budgetConfidential}
              onChange={(e) => update("budgetConfidential", e.target.checked)}
              className="accent-teal-600" />
            {t("rfqBudgetConfidential")}
          </label>
        </div>
      </Field>

      <Field
        label={t("rfqFieldAddress")}
        required
        error={errors.address}
        htmlFor="rfq-address"
        hint={t("rfqAddressHint")}
      >
        <Textarea id="rfq-address" rows={2} maxLength={500} value={form.address}
          error={!!errors.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder={t("rfqAddressPlaceholder")} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("rfqFieldIncoterm")} required error={errors.incoterm} htmlFor="rfq-incoterm">
          <Select id="rfq-incoterm" value={form.incoterm} error={!!errors.incoterm}
            onChange={(e) => update("incoterm", e.target.value)}>
            <option value="">{t("rfqSelectIncoterm")}</option>
            {INCOTERM_OPTIONS.map((term) => <option key={term} value={term}>{term}</option>)}
          </Select>
        </Field>
        <Field label={t("rfqFieldDeliveryTime")} required error={errors.deliveryTime} htmlFor="rfq-delivery">
          <Input id="rfq-delivery" value={form.deliveryTime} error={!!errors.deliveryTime}
            onChange={(e) => update("deliveryTime", e.target.value)}
            placeholder={t("rfqDeliveryTimePlaceholder")} />
        </Field>
      </div>

      <Field label={t("rfqFieldPayment")}>
        <ChipToggleGroup items={PAYMENT_OPTIONS.map((p) => ({ value: p, label: t(PAYMENT_LABEL_KEYS[p]) }))}
          selected={form.paymentTerms}
          onToggle={(v) => {
            const next = form.paymentTerms.includes(v)
              ? form.paymentTerms.filter((x) => x !== v)
              : form.paymentTerms.length < 3 ? [...form.paymentTerms, v] : form.paymentTerms;
            update("paymentTerms", next);
          }} />
      </Field>

      <Field label={t("rfqFieldDeadline")} required error={errors.deadline} htmlFor="rfq-deadline">
        <Input id="rfq-deadline" type="date" value={form.deadline} error={!!errors.deadline}
          min={tomorrowIso()}
          onChange={(e) => update("deadline", e.target.value)} />
      </Field>
    </div>
  );
}
