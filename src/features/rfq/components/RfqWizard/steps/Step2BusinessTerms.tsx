/**
 * Step 2 — 商务条款：预算、交付地点、贸易术语、付款方式、报价截止
 * @module features/rfq/components/RfqWizard/steps/Step2BusinessTerms
 */
import { ChipToggleGroup, Input, SearchableSelect, Select } from "@/shared/ui";
import { provinces as chinaProvinces } from "@/data/chinaDivision";
import {
  INCOTERM_OPTIONS, PAYMENT_OPTIONS, CURRENCY_OPTIONS,
} from "../../../constants";
import type { FieldErrors, RfqFormState } from "../../../types";
import { tomorrowIso } from "../utils";
import { Field } from "../ui/Field";

export interface Step2Props {
  form: RfqFormState;
  errors: FieldErrors;
  update: <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => void;
  citiesList: typeof chinaProvinces;
  districtsList: typeof chinaProvinces;
}

export function Step2BusinessTerms({ form, errors, update, citiesList, districtsList }: Step2Props) {
  return (
    <div className="space-y-5">
      <Field label="预算金额" required={!form.budgetConfidential} error={errors.budget}
        hint="帮助供应商了解采购规模，可一键保密">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input inputMode="decimal" value={form.budget} error={!!errors.budget} disabled={form.budgetConfidential}
            onChange={(e) => update("budget", e.target.value)} placeholder="预算金额" />
          <Select value={form.currency} disabled={form.budgetConfidential}
            onChange={(e) => update("currency", e.target.value)}>
            {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-secondary-600 cursor-pointer sm:col-span-2">
            <input type="checkbox" checked={form.budgetConfidential}
              onChange={(e) => update("budgetConfidential", e.target.checked)}
              className="accent-teal-600" />
            预算保密
          </label>
        </div>
      </Field>

      <Field label="交付地点" required error={errors.province}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <SearchableSelect
            options={chinaProvinces.map((p) => ({ value: Number(p.code), label: p.name }))}
            value={form.provinceId}
            onChange={(id) => {
              const p = chinaProvinces.find((x) => Number(x.code) === Number(id));
              update("provinceId", id ? Number(id) : null);
              update("provinceName", p?.name ?? "");
              update("cityId", null);
              update("cityName", "");
              update("districtId", null);
              update("districtName", "");
            }}
            placeholder="搜索省份"
          />
          <SearchableSelect
            options={citiesList.map((c) => ({ value: Number(c.code), label: c.name }))}
            value={form.cityId}
            onChange={(id) => {
              const c = citiesList.find((x) => Number(x.code) === Number(id));
              update("cityId", id ? Number(id) : null);
              update("cityName", c?.name ?? "");
              update("districtId", null);
              update("districtName", "");
            }}
            placeholder={form.provinceId ? "搜索城市" : "先选省份"}
            disabled={!form.provinceId}
          />
          <SearchableSelect
            options={districtsList.map((a) => ({ value: Number(a.code), label: a.name }))}
            value={form.districtId}
            onChange={(id) => {
              const a = districtsList.find((x) => Number(x.code) === Number(id));
              update("districtId", id ? Number(id) : null);
              update("districtName", a?.name ?? "");
            }}
            placeholder={form.cityId ? "搜索区/县" : "先选城市"}
            disabled={!form.cityId}
          />
          <Input
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="详细地址（街道、门牌号等）"
          />
        </div>
        {form.provinceName && (
          <p className="text-2xs text-secondary-500 mt-1.5">
            {[form.provinceName, form.cityName, form.districtName, form.address].filter(Boolean).join(" ")}
          </p>
        )}
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="贸易术语 (Incoterms)" required error={errors.incoterm} htmlFor="rfq-incoterm">
          <Select id="rfq-incoterm" value={form.incoterm} error={!!errors.incoterm}
            onChange={(e) => update("incoterm", e.target.value)}>
            <option value="">请选择贸易术语</option>
            {INCOTERM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="交付时间" required error={errors.deliveryTime} htmlFor="rfq-delivery">
          <Input id="rfq-delivery" value={form.deliveryTime} error={!!errors.deliveryTime}
            onChange={(e) => update("deliveryTime", e.target.value)}
            placeholder="如：合同签订后 60 天内" />
        </Field>
      </div>

      <Field label="付款方式">
        <ChipToggleGroup items={PAYMENT_OPTIONS.map((p) => ({ value: p, label: p }))}
          selected={form.paymentTerms}
          onToggle={(v) => {
            const next = form.paymentTerms.includes(v)
              ? form.paymentTerms.filter((x) => x !== v)
              : form.paymentTerms.length < 3 ? [...form.paymentTerms, v] : form.paymentTerms;
            update("paymentTerms", next);
          }} />
      </Field>

      <Field label="报价截止时间" required error={errors.deadline} htmlFor="rfq-deadline">
        <Input id="rfq-deadline" type="date" value={form.deadline} error={!!errors.deadline}
          min={tomorrowIso()}
          onChange={(e) => update("deadline", e.target.value)} />
      </Field>
    </div>
  );
}
