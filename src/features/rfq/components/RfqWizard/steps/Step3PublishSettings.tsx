/**
 * Step 3 — 发布设置：可见范围、供应商要求、附件占位、联系方式、发布承诺、确认摘要
 * @module features/rfq/components/RfqWizard/steps/Step3PublishSettings
 */
import { AlertTriangle, ChevronDown, Upload } from "lucide-react";
import { cn } from "@/shared/utils";
import { ChipToggleGroup, Input, SegmentedControl } from "@/shared/ui";
import { SUPPLIER_REQ_OPTIONS } from "../../../constants";
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
  /** 已选 UNSPSC 分类的中文名称（一级 / 二级），供发布前摘要核对 */
  categoryDisplay: string;
}

export function Step3PublishSettings({ form, errors, update, termsOpen, setTermsOpen, setStep, categoryDisplay }: Step3Props) {
  return (
    <div className="space-y-5">
      <Field label="可见范围" required>
        <SegmentedControl items={[
            { value: "public", label: "公开询价" },
            { value: "targeted", label: "定向邀约" },
          ]} value={form.visibility}
          onChange={(v) => update("visibility", v)}
          fullWidth
        />
        <p className="text-2xs text-secondary-400 mt-1">
          {form.visibility === "public" ? "所有认证供应商均可查看并报价" : "仅被邀请的供应商可以查看并报价"}
        </p>
      </Field>

      <Field label="供应商资质要求">
        <ChipToggleGroup items={SUPPLIER_REQ_OPTIONS.map((s) => ({ value: s, label: s }))}
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
        <p className="text-sm font-bold text-secondary-500">附件上传功能即将开放</p>
        <p className="text-2xs text-secondary-400 mt-1">如有技术图纸等文件，请在需求描述中注明</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="联系人姓名" required error={errors.contactName} htmlFor="rfq-name">
          <Input id="rfq-name" value={form.contactName} error={!!errors.contactName}
            onChange={(e) => update("contactName", e.target.value)} placeholder="您的姓名" />
        </Field>
        <Field label="联系邮箱" required error={errors.contactEmail} htmlFor="rfq-email">
          <Input id="rfq-email" type="email" value={form.contactEmail} error={!!errors.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)} placeholder="报价通知邮箱" />
        </Field>
      </div>

      <Field label="联系电话">
        <Input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)}
          placeholder="选填，方便供应商紧急联系" />
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
              我已阅读并同意《RFQ 发布承诺》
              <ChevronDown className={cn("w-4 h-4 transition-transform", termsOpen && "rotate-180")} />
            </button>
            {termsOpen && (
              <ul className="mt-2 text-xs text-secondary-500 space-y-1 list-disc list-inside">
                <li>本需求真实有效，不存在虚假信息</li>
                <li>报价截止后将对中选供应商履行签约义务</li>
                <li>同意平台对需求内容进行合规审核</li>
                <li>理解并同意平台的隐私保护政策</li>
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
          <h4 className="text-sm font-bold text-secondary-900">发布前请确认</h4>
          <span className="text-2xs text-secondary-400">点击"修改"可返回对应步骤</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <SummaryItem label="需求标题" value={form.title} onEdit={() => setStep(0)} />
          <SummaryItem label="产品分类" value={categoryDisplay} onEdit={() => setStep(0)} />
          <SummaryItem label="预算" value={form.budgetConfidential ? "保密" : form.budget ? `${form.budget} 万元` : ""} onEdit={() => setStep(1)} />
          <SummaryItem label="交付地点" value={[form.provinceName, form.cityName, form.districtName, form.address].filter(Boolean).join(" ")} onEdit={() => setStep(1)} />
          <SummaryItem label="报价截止" value={form.deadline || ""} onEdit={() => setStep(1)} />
          <SummaryItem label="可见范围" value={form.visibility === "public" ? "公开询价" : "定向邀约"} onEdit={() => setStep(2)} />
          <SummaryItem label="附件" value={form.attachments.length ? `${form.attachments.length} 个文件` : ""} onEdit={() => setStep(2)} />
          <SummaryItem label="联系人" value={form.contactName || form.contactEmail || ""} onEdit={() => setStep(2)} />
        </dl>
      </div>
    </div>
  );
}
