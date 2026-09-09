"use client";

/**
 * RFQ 四步发布向导
 * RFQ 4-Step Publish Wizard
 *
 * @module features/rfq/components/RfqWizard
 * @description 需求概要 → 数量规格 → 采购条款 → 发布确认。
 *              字段级校验（步骤级拦截 + 滚动聚焦首个错误）、
 *              草稿即时上报（监听 form 统一上报，页面层负责持久化）、
 *              联系方式登录态预填。
 *              TODO(P1): 提交接入 createRfq API，附件换预签名直传。
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, Lock, Pencil, Plus, Send, Upload, X,
} from "lucide-react";

import { cn } from "@/shared/utils";
import { Button, ChipToggleGroup, Input, SegmentedControl, Select, Textarea } from "@/shared/ui";
import {
  CATEGORY_TREE, CERT_OPTIONS, CURRENCY_OPTIONS, DEFAULT_RFQ_FORM, INCOTERM_OPTIONS,
  PAYMENT_OPTIONS, SPEC_PRESETS, SUPPLIER_REQ_OPTIONS, TARGET_COUNTRIES, UNIT_OPTIONS,
} from "../constants";
import type { FieldErrors, PurchaseType, RfqFormState } from "../types";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILE_COUNT = 10;
const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp";

/** 需求描述默认模板（引导用户填写关键信息） */
const DESCRIPTION_TEMPLATE = `【采购背景】
（简述采购用途和项目背景）

【产品/服务要求】
（规格、型号、技术参数等）

【数量与交付】
（数量、交付时间、交付地点）

【资质要求】
（认证、行业经验等）

【报价要求】
（报价币种、付款条件、贸易术语）`;

const STEP_META = [
  { title: "需求概要" },
  { title: "数量规格" },
  { title: "采购条款" },
  { title: "发布确认" },
] as const;

interface RfqWizardProps {
  initialData: RfqFormState;
  /** 登录态联系方式预填 */
  authContact: { name: string; email: string };
  /** 表单变更上报（页面层负责草稿持久化；跳过首次挂载） */
  onDataChange: (data: RfqFormState) => void;
  /** 发布成功后回调（页面层清除草稿） */
  onPublished: () => void;
}

/** 明天 ISO 日期（截止时间下限，本地时区） */
function tomorrowIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RfqWizard({ initialData, authContact, onDataChange, onPublished }: RfqWizardProps) {
  const [form, setForm] = useState<RfqFormState>(initialData);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);

  /** 表单变更统一上报草稿（跳过挂载首帧，避免空表单落草稿） */
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onDataChange(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  /** 联系方式登录态预填（仅在字段为空时，不覆盖草稿） */
  useEffect(() => {
    setForm((prev) => {
      if (prev.contactName || prev.contactEmail) return prev;
      if (!authContact.name && !authContact.email) return prev;
      return {
        ...prev,
        contactName: prev.contactName || authContact.name,
        contactEmail: prev.contactEmail || authContact.email,
      };
    });
  }, [authContact.name, authContact.email]);

  /** 单字段更新：清掉自身错误 */
  function update<K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  /** 切换一级类目：重置二级 */
  function onCategoryL1(v: string) {
    setForm((prev) => ({ ...prev, categoryL1: v, categoryL2: "" }));
    setErrors((prev) => ({ ...prev, categoryL2: "" }));
  }

  /** 选择二级类目：规格行全空时按类目预置参数名 */
  function onCategoryL2(v: string) {
    const preset = SPEC_PRESETS[v];
    setForm((prev) => ({
      ...prev,
      categoryL2: v,
      specs: preset && prev.specs.every((s) => !s.name && !s.value)
        ? preset.map((name) => ({ name, value: "" }))
        : prev.specs,
    }));
    setErrors((prev) => ({ ...prev, categoryL2: "" }));
  }

  // ── 校验 ──
  function validateStep(s: number): FieldErrors {
    const e: FieldErrors = {};
    if (s === 0) {
      const title = form.title.trim();
      if (title.length < 5) e.title = "标题至少 5 个字，建议写明产品和数量，例如“采购光伏组件 10MW”";
      if (!form.categoryL2) e.categoryL2 = "请选择产品/服务分类";
      const desc = form.description.trim();
      if (desc.length < 50) e.description = `描述至少 50 个字（当前 ${desc.length}），请补充用途、技术要求与验收标准`;
      else if (desc.length > 2000) e.description = "描述不能超过 2000 字";
    }
    if (s === 1) {
      if (!/^\d+(\.\d+)?$/.test(form.quantity.trim()) || Number(form.quantity) <= 0) {
        e.quantity = "请输入大于 0 的数量";
      }
      const complete = form.specs.filter((r) => r.name.trim() && r.value.trim());
      const partial = form.specs.some((r) => !!(r.name.trim() ? !r.value.trim() : r.value.trim()));
      if (complete.length === 0 && !partial) e.specs = "请至少填写一行规格参数";
      else if (partial) e.specs = "存在未填完整的参数行，请补全或删除";
    }
    if (s === 2) {
      if (!form.deadline) e.deadline = "请选择报价截止时间";
      else if (form.deadline < tomorrowIso()) e.deadline = "截止时间至少在 24 小时以后";
      if (!form.countries.length) e.countries = "请选择至少一个目标国家/地区";
      if (!form.budgetConfidential) {
        const min = form.budgetMin.trim();
        const max = form.budgetMax.trim();
        if (!min && !max) e.budget = "请填写预算区间，或勾选“预算保密”";
        else if (min && max && Number(min) > Number(max)) e.budget = "最低预算不能高于最高预算";
      }
    }
    if (s === 3) {
      if (!form.contactName.trim()) e.contactName = "请填写联系人姓名";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) e.contactEmail = "请输入有效邮箱，报价通知将发送至此";
      if (!form.agreed) e.agreed = "请阅读并勾选发布承诺";
    }
    return e;
  }

  function scrollToFirstError() {
    requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>('[data-error="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function goNext() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      scrollToFirstError();
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEP_META.length - 1));
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goPrev() {
    setErrors({});
    setStep((prev) => Math.max(prev - 1, 0));
  }

  // ── 附件 ──
  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const messages: string[] = [];
    const accepted = incoming.filter((f) => {
      if (f.size > MAX_FILE_SIZE) messages.push(`「${f.name}」超过 20MB`);
      return f.size <= MAX_FILE_SIZE;
    });
    const merged = [...form.attachments, ...accepted.map((f) => ({ name: f.name, size: f.size }))];
    if (merged.length > MAX_FILE_COUNT) messages.push(`最多上传 ${MAX_FILE_COUNT} 个附件`);
    setForm((prev) => ({ ...prev, attachments: merged.slice(0, MAX_FILE_COUNT) }));
    setErrors((prev) => ({ ...prev, attachments: messages[0] ?? "" }));
  }

  // ── 提交（TODO(P1): 接入 createRfq API，失败时保留数据并可重试） ──
  function handleSubmit() {
    const e = validateStep(3);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      scrollToFirstError();
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      onPublished();
    }, 900);
  }

  function resetForm() {
    setForm({ ...DEFAULT_RFQ_FORM, contactName: authContact.name, contactEmail: authContact.email });
    setStep(0);
    setErrors({});
    setSubmitted(false);
  }

  // ══ 成功态 ══
  if (submitted) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs" id="rfq-form">
        <div className="text-center py-14">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 border border-primary-100 mb-5">
            <Check className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-xl font-extrabold text-secondary-900 mb-2">需求已提交</h3>
          <p className="text-sm text-secondary-500 max-w-md mx-auto leading-relaxed">
            平台将通过真实性审核后开始匹配供应商，审核与报价进展将通知到 {form.contactEmail}。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => document.getElementById("rfq-plaza")?.scrollIntoView({ behavior: "smooth" })}>
              看看其他需求
            </Button>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4" /> 再发一条
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const l1 = CATEGORY_TREE.find((c) => c.label === form.categoryL1);

  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs" id="rfq-form" ref={rootRef}>
      {/* 步骤指示条 */}
      <div className="flex items-center gap-2 mb-6">
        {STEP_META.map((meta, idx) => {
          const done = idx < step;
          const current = idx === step;
          return (
            <div key={meta.title} className="flex items-center gap-2 flex-1 last:flex-none min-w-0">
              <button
                type="button"
                disabled={idx > step}
                onClick={() => { if (done) { setErrors({}); setStep(idx); } }}
                className={cn("flex items-center gap-2 min-w-0", done ? "cursor-pointer" : "cursor-default")}
              >
                <span className={cn(
                  "w-7 h-7 shrink-0 rounded-full text-xs font-bold flex items-center justify-center transition-colors",
                  done && "bg-primary-600 text-white",
                  current && "border-2 border-primary-600 text-primary-600 bg-white",
                  !done && !current && "bg-secondary-100 text-secondary-400",
                )}>
                  {done ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                </span>
                <span className={cn(
                  "text-xs whitespace-nowrap hidden sm:inline",
                  current ? "font-bold text-secondary-900" : done ? "text-secondary-500" : "text-secondary-400",
                )}>
                  {meta.title}
                </span>
              </button>
              {idx < STEP_META.length - 1 && (
                <span className={cn("flex-1 h-px min-w-4", idx < step ? "bg-primary-400" : "bg-secondary-200")} />
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ Step 1 需求概要 ═══ */}
      {step === 0 && (
        <div className="space-y-5">
          <Field label="需求标题" required error={errors.title} htmlFor="rfq-title"
            counter={`${form.title.length}/80`}
            hint="格式建议：采购〔产品〕〔数量〕，交付至〔国家〕">
            <Input id="rfq-title" maxLength={80} value={form.title} error={!!errors.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="例如：采购光伏组件 10MW，交付至德国汉堡" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="产品/服务分类（一级）" required htmlFor="rfq-cat1">
              <Select id="rfq-cat1" value={form.categoryL1} onChange={(e) => onCategoryL1(e.target.value)}>
                <option value="">请选择</option>
                {CATEGORY_TREE.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="产品/服务分类（二级）" required error={errors.categoryL2} htmlFor="rfq-cat2">
              <Select id="rfq-cat2" value={form.categoryL2} error={!!errors.categoryL2}
                onChange={(e) => onCategoryL2(e.target.value)} disabled={!form.categoryL1}>
                <option value="">{form.categoryL1 ? "请选择" : "请先选择一级分类"}</option>
                {l1?.children.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="采购类型" required>
            <SegmentedControl
              fullWidth
              size="sm"
              value={form.purchaseType}
              onChange={(v) => update("purchaseType", v as PurchaseType)}
              items={[
                { value: "once", label: "一次性采购" },
                { value: "framework", label: "框架协议" },
                { value: "longterm", label: "长期供货" },
              ]}
            />
          </Field>

          <Field label="需求描述" required error={errors.description} htmlFor="rfq-desc"
            counter={`${form.description.length}/2000`}
            hint="建议包含：用途、技术要求、验收标准">
            <Textarea id="rfq-desc" rows={8} maxLength={2000} value={form.description}
              error={!!errors.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder={DESCRIPTION_TEMPLATE} />
          </Field>
        </div>
      )}

      {/* ═══ Step 2 数量规格 ═══ */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="数量" required error={errors.quantity} htmlFor="rfq-qty">
                <Input id="rfq-qty" inputMode="decimal" value={form.quantity} error={!!errors.quantity}
                  onChange={(e) => update("quantity", e.target.value)} placeholder="如：5000" />
              </Field>
            </div>
            <Field label="单位" required htmlFor="rfq-unit">
              <Select id="rfq-unit" value={form.unit} onChange={(e) => update("unit", e.target.value)}>
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="规格参数" required error={errors.specs}
            hint="可按行填写参数名与要求；选择二级分类后已预置常用参数">
            <div className="space-y-2">
              {form.specs.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="flex-1" value={row.name} placeholder="参数名（如：功率）"
                    onChange={(e) => {
                      update("specs", form.specs.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)));
                    }} />
                  <Input className="flex-[1.4]" value={row.value} placeholder="要求（如：550W 以上）"
                    onChange={(e) => {
                      update("specs", form.specs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)));
                    }} />
                  <button type="button" aria-label="删除参数行" disabled={form.specs.length === 1}
                    onClick={() => update("specs", form.specs.filter((_, j) => j !== i))}
                    className="shrink-0 w-9 h-9 rounded-lg text-secondary-400 hover:bg-secondary-100 hover:text-danger-600 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => update("specs", [...form.specs, { name: "", value: "" }])}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-800">
                <Plus className="w-3.5 h-3.5" /> 添加参数
              </button>
            </div>
          </Field>

          <Field label="质量与认证要求" hint="选填，认证要求将用于供应商匹配">
            <ChipToggleGroup items={CERT_OPTIONS.map((c) => ({ value: c, label: c }))}
              selected={form.certs}
              onToggle={(v) => update("certs", form.certs.includes(v) ? form.certs.filter((c) => c !== v) : [...form.certs, v])} />
          </Field>

          <Field label="附件" error={errors.attachments}
            hint="支持 PDF / Word / Excel / 图片，单个不超过 20MB，最多 10 个">
            <input ref={fileRef} type="file" multiple accept={FILE_ACCEPT} className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <div
              role="button" tabIndex={0} aria-label="上传附件"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-secondary-300 px-4 py-5 text-sm text-secondary-500 hover:border-primary-400 hover:text-primary-700 cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4" /> 点击上传或拖拽文件到此处
            </div>
            {form.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.attachments.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary-100 px-2.5 py-1 text-xs text-secondary-600">
                    {f.name} <span className="text-secondary-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button type="button" aria-label={`移除 ${f.name}`}
                      onClick={() => update("attachments", form.attachments.filter((_, j) => j !== i))}
                      className="text-secondary-400 hover:text-danger-600">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="是否需要样品">
            <SegmentedControl size="sm" value={form.needSample ? "yes" : "no"}
              onChange={(v) => update("needSample", v === "yes")}
              items={[{ value: "no", label: "不需要" }, { value: "yes", label: "需要样品" }]} />
          </Field>
        </div>
      )}

      {/* ═══ Step 3 采购条款 ═══ */}
      {step === 2 && (
        <div className="space-y-5">
          <Field label="预算区间" required={!form.budgetConfidential} error={errors.budget}
            hint="帮助供应商判断报价区间，可一键保密">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Input inputMode="decimal" value={form.budgetMin} error={!!errors.budget} disabled={form.budgetConfidential}
                onChange={(e) => update("budgetMin", e.target.value)} placeholder="最低（万）" />
              <Input inputMode="decimal" value={form.budgetMax} error={!!errors.budget} disabled={form.budgetConfidential}
                onChange={(e) => update("budgetMax", e.target.value)} placeholder="最高（万）" />
              <Select value={form.currency} disabled={form.budgetConfidential} onChange={(e) => update("currency", e.target.value)} aria-label="币种">
                {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <label className="flex items-center gap-2 text-sm text-secondary-600 cursor-pointer select-none px-1">
                <input type="checkbox" className="accent-primary-600 w-4 h-4" checked={form.budgetConfidential}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((prev) => ({ ...prev, budgetConfidential: checked }));
                    setErrors((prev) => ({ ...prev, budget: "" }));
                  }} />
                预算保密
              </label>
            </div>
          </Field>

          <Field label="目标国家/地区" required error={errors.countries} hint="可多选，用于匹配对应市场的供应商">
            <ChipToggleGroup
              items={TARGET_COUNTRIES.map((c) => ({ value: c.en, label: c.zh }))}
              selected={form.countries}
              onToggle={(v) => update("countries", form.countries.includes(v) ? form.countries.filter((c) => c !== v) : [...form.countries, v])}
            />
          </Field>

          <Field label="报价截止时间" required error={errors.deadline} htmlFor="rfq-deadline"
            hint={form.deadline && !errors.deadline ? undefined : "给供应商留出报价时间，默认建议两周以上"}>
            <Input id="rfq-deadline" type="date" min={tomorrowIso()} value={form.deadline}
              error={!!errors.deadline}
              onChange={(e) => update("deadline", e.target.value)} />
          </Field>

          <Field label="期望供应商资质" hint="选填，用于匹配加权">
            <ChipToggleGroup
              items={SUPPLIER_REQ_OPTIONS.map((c) => ({ value: c, label: c }))}
              selected={form.supplierReqs}
              onToggle={(v) => update("supplierReqs", form.supplierReqs.includes(v) ? form.supplierReqs.filter((c) => c !== v) : [...form.supplierReqs, v])}
            />
          </Field>

          {/* 折叠组：交付与付款（选填） */}
          <div className="rounded-xl border border-secondary-200 bg-secondary-50/60">
            <button type="button"
              onClick={() => setTermsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-secondary-700"
              aria-expanded={termsOpen}>
              交付与付款条款（选填）
              <ChevronDown className={cn("w-4 h-4 transition-transform", termsOpen && "rotate-180")} />
            </button>
            {termsOpen && (
              <div className="px-4 pb-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="交付条款" htmlFor="rfq-incoterm">
                    <Select id="rfq-incoterm" value={form.incoterm} onChange={(e) => update("incoterm", e.target.value)}>
                      <option value="">请选择</option>
                      {INCOTERM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </Field>
                  <Field label="目的地/港口" htmlFor="rfq-dest">
                    <Input id="rfq-dest" value={form.destination} onChange={(e) => update("destination", e.target.value)} placeholder="如：汉堡港" />
                  </Field>
                  <Field label="期望交付期" htmlFor="rfq-delivery">
                    <Input id="rfq-delivery" value={form.deliveryTime} onChange={(e) => update("deliveryTime", e.target.value)} placeholder="如：签约后 60 天" />
                  </Field>
                </div>
                <Field label="付款方式">
                  <ChipToggleGroup
                    items={PAYMENT_OPTIONS.map((c) => ({ value: c, label: c }))}
                    selected={form.paymentTerms}
                    onToggle={(v) => update("paymentTerms", form.paymentTerms.includes(v) ? form.paymentTerms.filter((c) => c !== v) : [...form.paymentTerms, v])}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Step 4 发布确认 ═══ */}
      {step === 3 && (
        <div className="space-y-5">
          <Field label="可见范围" required>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: "public", title: "公开询价", desc: "所有认证供应商可见，报价更多" },
                { value: "targeted", title: "定向邀约", desc: "仅受邀供应商可见，指定行业与认证" },
              ] as const).map((opt) => {
                const active = form.visibility === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => update("visibility", opt.value)}
                    className={cn(
                      "relative rounded-xl border p-4 text-left transition-colors",
                      active ? "border-primary-600 bg-primary-50/50 ring-1 ring-primary-600" : "border-secondary-200 hover:border-secondary-300",
                    )}>
                    {active && <Check className="absolute top-3 right-3 w-4 h-4 text-primary-600" />}
                    <div className="text-sm font-bold text-secondary-900">{opt.title}</div>
                    <div className="text-xs text-secondary-500 mt-1">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="联系人" required error={errors.contactName} htmlFor="rfq-contact">
              <Input id="rfq-contact" value={form.contactName} error={!!errors.contactName}
                onChange={(e) => update("contactName", e.target.value)} placeholder="姓名" />
            </Field>
            <Field label="邮箱" required error={errors.contactEmail} htmlFor="rfq-email">
              <Input id="rfq-email" type="email" value={form.contactEmail} error={!!errors.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)} placeholder="name@company.com" />
            </Field>
            <Field label="电话" htmlFor="rfq-phone" hint="选填">
              <Input id="rfq-phone" value={form.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)} placeholder="+86 …" />
            </Field>
          </div>
          <p className="text-xs text-secondary-400 flex items-center gap-1 -mt-2">
            <Lock className="w-3 h-3" /> 联系方式仅平台与已报价供应商可见，不对外公开展示
          </p>

          {/* 需求摘要 */}
          <div className="rounded-xl border border-secondary-200 bg-secondary-50/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-secondary-900">发布前请确认</h4>
              <span className="text-2xs text-secondary-400">点击“修改”可返回对应步骤</span>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              <SummaryItem label="需求标题" value={form.title} onEdit={() => setStep(0)} />
              <SummaryItem label="产品分类" value={[form.categoryL1, form.categoryL2].filter(Boolean).join(" / ")} onEdit={() => setStep(0)} />
              <SummaryItem label="数量规格" value={form.quantity ? `${form.quantity} ${form.unit}` : ""} onEdit={() => setStep(1)} />
              <SummaryItem label="附件与认证" value={[form.attachments.length ? `附件 ${form.attachments.length} 个` : "", form.certs.length ? `认证 ${form.certs.length} 项` : ""].filter(Boolean).join("，") || "无"} onEdit={() => setStep(1)} />
              <SummaryItem label="预算" value={form.budgetConfidential ? "保密" : form.budgetMin || form.budgetMax ? `${form.currency} ${[form.budgetMin, form.budgetMax].filter(Boolean).join(" – ")} 万` : ""} onEdit={() => setStep(2)} />
              <SummaryItem label="目标国家" value={form.countries.length ? TARGET_COUNTRIES.filter((c) => form.countries.includes(c.en)).map((c) => c.zh).join("、") : ""} onEdit={() => setStep(2)} />
              <SummaryItem label="报价截止" value={form.deadline} onEdit={() => setStep(2)} />
              <SummaryItem label="可见范围" value={form.visibility === "public" ? "公开询价" : "定向邀约"} onEdit={() => setStep(3)} />
            </dl>
          </div>

          <Field error={errors.agreed}>
            <label className="flex items-start gap-2 text-sm text-secondary-600 cursor-pointer select-none">
              <input type="checkbox" className="accent-primary-600 w-4 h-4 mt-0.5" checked={form.agreed}
                onChange={(e) => update("agreed", e.target.checked)} />
              本人承诺以上信息真实有效，并同意平台《RFQ 发布规则》
            </label>
          </Field>
        </div>
      )}

      {/* 底部操作栏（滚动中常驻可见） */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex items-center justify-between gap-3 border-t border-secondary-100 bg-white/95 px-6 py-3 backdrop-blur rounded-b-2xl">
        {step > 0 ? (
          <Button variant="outline" onClick={goPrev}><ChevronLeft className="w-4 h-4" /> 上一步</Button>
        ) : (
          <span className="text-xs text-secondary-400 hidden sm:block">带 * 为必填项</span>
        )}
        {step < STEP_META.length - 1 ? (
          <Button onClick={goNext}>下一步</Button>
        ) : (
          <Button onClick={handleSubmit} loading={submitting}>
            {!submitting && <Send className="w-4 h-4" />} 提交需求
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── 字段壳：label + 控件 + 错误提示 + 计数/提示 ── */
function Field({
  label, required, error, hint, counter, htmlFor, children,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  counter?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-error={error ? "true" : undefined}>
      {label && (
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor={htmlFor} className="text-xs font-bold text-secondary-700">
            {label} {required && <span className="text-danger-500">*</span>}
          </label>
          {counter && <span className="text-2xs text-secondary-400">{counter}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger-600 flex items-start gap-1" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-2xs text-secondary-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ── 摘要条目 ── */
function SummaryItem({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 min-w-0">
      <dt className="text-xs text-secondary-400 shrink-0">{label}</dt>
      <dd className="text-xs text-secondary-800 font-medium text-right min-w-0 truncate flex items-center gap-1.5">
        <span className="truncate">{value || "—"}</span>
        {value && (
          <button type="button" onClick={onEdit} aria-label={`修改${label}`}
            className="text-secondary-400 hover:text-primary-700 shrink-0">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </dd>
    </div>
  );
}
