/**
 * Step 1 — 需求概要：标题、UNSPSC 分类、采购类型、需求描述
 * @module features/rfq/components/RfqWizard/steps/Step1ProductInfo
 */
import { Input, SegmentedControl, Select, Textarea } from "@/shared/ui";
import type { UnspscOption } from "@/core/unspsc";
import type { FieldErrors, RfqFormState } from "../../../types";
import { Field } from "../ui/Field";

export interface Step1Props {
  form: RfqFormState;
  errors: FieldErrors;
  update: <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => void;
  onCategoryL1: (v: string) => void;
  l1Options: UnspscOption[];
  l2Options: UnspscOption[];
}

export function Step1ProductInfo({ form, errors, update, onCategoryL1, l1Options, l2Options }: Step1Props) {
  return (
    <div className="space-y-5">
      <Field label="需求标题" required error={errors.title} htmlFor="rfq-title"
        counter={`${form.title.length}/50`}
        hint="建议10-50字，格式：采购〔产品〕〔数量〕">
        <Input id="rfq-title" maxLength={50} value={form.title} error={!!errors.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="例：采购光伏组件 10MW" />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="一级分类" required error={errors.categoryL1} htmlFor="rfq-cat1">
          <Select id="rfq-cat1" value={form.categoryL1} error={!!errors.categoryL1}
            onChange={(e) => onCategoryL1(e.target.value)}>
            <option value="">请选择一级分类</option>
            {l1Options.map((o) => <option key={o.id} value={String(o.id)}>{o.title_zh || o.title || o.code}</option>)}
          </Select>
        </Field>
        <Field label="二级分类" required error={errors.categoryL2} htmlFor="rfq-cat2">
          <Select id="rfq-cat2" value={form.categoryL2} error={!!errors.categoryL2}
            onChange={(e) => update("categoryL2", e.target.value)}
            disabled={!form.categoryL1}>
            <option value="">请选择二级分类</option>
            {l2Options.map((o) => <option key={o.id} value={String(o.id)}>{o.title_zh || o.title || o.code}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="采购类型" required>
        <SegmentedControl items={[
            { value: "once", label: "单次采购" },
            { value: "framework", label: "框架协议" },
            { value: "longterm", label: "长期供货" },
          ]} value={form.purchaseType}
          onChange={(v) => update("purchaseType", v)}
          fullWidth
        />
      </Field>

      <Field label="需求描述" required error={errors.description} htmlFor="rfq-desc"
        counter={`${form.description.length}/2000`}
        hint="建议包含：用途、技术要求、验收标准">
        <Textarea id="rfq-desc" rows={12} maxLength={2000} value={form.description}
          error={!!errors.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="请在此填写您的采购需求…"
          className="resize-none" />
      </Field>
    </div>
  );
}
