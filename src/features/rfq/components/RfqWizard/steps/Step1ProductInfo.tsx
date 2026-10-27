/**
 * Step 1 — 需求概要：标题、品目分类（UGT 骨架树 L1→L2→L3 三级）、采购类型、需求描述
 * @module features/rfq/components/RfqWizard/steps/Step1ProductInfo
 */
import { Input, SegmentedControl, Select, Textarea } from "@/shared/ui";
import { useLocale } from "@/core/i18n";

import type { CommodityTreeOption } from "@/features/procurement/api/commodityTree";
import type { FieldErrors, RfqFormState } from "../../../types";
import { Field } from "../ui/Field";

export interface Step1Props {
  form: RfqFormState;
  errors: FieldErrors;
  update: <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => void;
  onCategoryL1: (v: string) => void;
  /** 一级 = 32 个 L1 大类行（树接口直出）；二级 = 中类；三级 = 小类（发布定位到小类，约 1,175 个） */
  l1Options: CommodityTreeOption[];
  l2Options: CommodityTreeOption[];
  l3Options: CommodityTreeOption[];
  onCategoryL2: (v: string) => void;
}

export function Step1ProductInfo({
  form, errors, update, onCategoryL1, onCategoryL2,
  l1Options, l2Options, l3Options,
}: Step1Props) {
  const { locale } = useLocale();
  return (
    <div className="space-y-5">
      <Field label="需求标题" required error={errors.title} htmlFor="rfq-title"
        counter={`${form.title.length}/50`}
        hint="建议10-50字，格式：采购〔产品〕〔数量〕">
        <Input id="rfq-title" maxLength={50} value={form.title} error={!!errors.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="例：采购光伏组件 10MW" />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="一级分类" required error={errors.categoryL1} htmlFor="rfq-cat1">
          <Select id="rfq-cat1" value={form.categoryL1} error={!!errors.categoryL1}
            onChange={(e) => onCategoryL1(e.target.value)}>
            <option value="">请选择一级分类</option>
            {l1Options.map((o) => (
              <option key={o.key} value={o.key}>{o.nameZh || o.nameEn || o.key}</option>
            ))}
          </Select>
        </Field>
        <Field label="二级分类" required error={errors.categoryL2} htmlFor="rfq-cat2">
          <Select id="rfq-cat2" value={form.categoryL2} error={!!errors.categoryL2}
            onChange={(e) => onCategoryL2(e.target.value)}
            disabled={!form.categoryL1}>
            <option value="">请选择二级分类</option>
            {l2Options.map((o) => {
              const label = (locale === "zh" ? o.nameZh : o.nameEn) || o.nameZh || o.nameEn || o.key;
              return <option key={o.key} value={o.key}>{label}</option>;
            })}
          </Select>
        </Field>
        <Field label="三级分类" required error={errors.categoryL3} htmlFor="rfq-cat3">
          <Select id="rfq-cat3" value={form.categoryL3} error={!!errors.categoryL3}
            onChange={(e) => update("categoryL3", e.target.value)}
            disabled={!form.categoryL2}>
            <option value="">请选择三级分类</option>
            {l3Options.map((o) => {
              const label = (locale === "zh" ? o.nameZh : o.nameEn) || o.nameZh || o.nameEn || o.key;
              return <option key={o.key} value={o.key}>{label}</option>;
            })}
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
