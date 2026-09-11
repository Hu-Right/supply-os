"use client";

/**
 * RFQ 三步发布向导
 * RFQ 3-Step Publish Wizard
 *
 * @module features/rfq/components/RfqWizard
 * @description 需求概要 → 商务条款 → 发布设置。
 *              字段级校验（步骤级拦截 + 滚动聚焦首个错误）、
 *              草稿即时上报（监听 form 统一上报，页面层负责持久化）、
 *              联系方式登录态预填。
 *              提交已接入 /api/rfq/create，附件 P2 接入 OSS 预签名直传。
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, Lock, Pencil, Send, Upload, X,
} from "lucide-react";

import { cn } from "@/shared/utils";
import { Button, ChipToggleGroup, Input, SearchableSelect, SegmentedControl, Select, Textarea } from "@/shared/ui";
import { provinces as chinaProvinces, cities as chinaCities, areas as chinaAreas } from "@/data/chinaDivision";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { fetchUnspscIndustries, fetchUnspscChildren, type UnspscOption } from "@/core/unspsc";
import {
  CURRENCY_OPTIONS, DEFAULT_RFQ_FORM, INCOTERM_OPTIONS,
  PAYMENT_OPTIONS, SUPPLIER_REQ_OPTIONS,
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
  { title: "商务条款" },
  { title: "发布设置" },
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

// ── 字段容器（必须在组件外部定义，否则每次渲染重建导致输入框失焦）──
function Field({ label, required, error, hint, counter, htmlFor, children }: {
  label: string; required?: boolean; error?: string; hint?: string; counter?: string;
  htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-bold text-secondary-800">
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        {counter && <span className="text-2xs text-secondary-400">{counter}</span>}
      </div>
      {children}
      {hint && !error && <p className="text-2xs text-secondary-400">{hint}</p>}
      {error && (
        <p className="text-2xs text-rose-600 flex items-center gap-1" data-error="true">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

// ── 发布确认摘要项 ─
function SummaryItem({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-secondary-100 last:border-0">
      <div>
        <dt className="text-2xs text-secondary-400 mb-0.5">{label}</dt>
        <dd className="text-sm text-secondary-800 break-words">{value || <span className="text-secondary-300">未填写</span>}</dd>
      </div>
      <button type="button" onClick={onEdit} className="text-2xs text-teal-600 hover:text-teal-700 font-bold flex items-center gap-0.5 shrink-0 ml-3">
        <Pencil className="w-3 h-3" /> 修改
      </button>
    </div>
  );
}

// ── 步骤指示器（必须在组件外部，避免渲染时重建子树）──
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEP_META.map((s, i) => {
        const isActive = i === step;
        const isDone = i < step;
        return (
          <div key={s.title} className="flex items-center gap-2 flex-1">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors",
              isActive && "bg-teal-600 text-white",
              isDone && "bg-teal-100 text-teal-700",
              !isActive && !isDone && "bg-secondary-100 text-secondary-500",
            )}>
              {isDone ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              "text-sm font-bold truncate",
              isActive ? "text-secondary-900" : isDone ? "text-teal-700" : "text-secondary-400",
            )}>{s.title}</span>
            {i < STEP_META.length - 1 && <div className="flex-1 h-px bg-secondary-200 mx-2" />}
          </div>
        );
      })}
    </div>
  );
}

export function RfqWizard({ initialData, authContact, onDataChange, onPublished }: RfqWizardProps) {
  const { authUser } = useAuth();

  // 登录门槛：未登录用户无法填写表单
  if (!authUser) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-secondary-900 mb-2">发布采购需求需要先登录</h3>
        <p className="text-sm text-secondary-500 mb-6">登录后即可发布采购需求，平台将智能匹配供应商</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>
          立即登录
        </Button>
      </div>
    );
  }

  // 描述为空时预填模板（让用户看到结构和提示）
  const initialForm: RfqFormState = {
    ...initialData,
    description: initialData.description || DESCRIPTION_TEMPLATE,
  };
  const [form, setForm] = useState<RfqFormState>(initialForm);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);

  // 调试：追踪组件挂载/卸载
  useEffect(() => {
    console.log("[DEBUG] RfqWizard MOUNTED");
    return () => console.log("[DEBUG] RfqWizard UNMOUNTED");
  }, []);

  // 调试：追踪 title 每次变化
  useEffect(() => {
    console.log("[DEBUG] form.title =", JSON.stringify(form.title), "len=", form.title.length, "step=", step);
  }, [form.title, step]);

  // ── UNSPSC 分类数据 ──
  const [l1Options, setL1Options] = useState<UnspscOption[]>([]);
  const [l2Options, setL2Options] = useState<UnspscOption[]>([]);

  useEffect(() => {
    fetchUnspscIndustries("zh").then(setL1Options).catch(() => setL1Options([]));
  }, []);

  useEffect(() => {
    if (!form.categoryL1) { setL2Options([]); return; }
    fetchUnspscChildren(form.categoryL1, "zh").then(setL2Options).catch(() => setL2Options([]));
  }, [form.categoryL1]);

  // 省/市/区数据（仅中国行政区划）
  const [citiesList, setCitiesList] = useState<typeof chinaCities>([]);
  const [districtsList, setDistrictsList] = useState<typeof chinaAreas>([]);

  // 省份变化时加载城市列表
  useEffect(() => {
    if (!form.provinceId) {
      setCitiesList([]);
      setDistrictsList([]);
      return;
    }
    const provinceCode = String(form.provinceId).padStart(2, "0");
    setCitiesList(chinaCities.filter((c) => c.provinceCode === provinceCode));
    setDistrictsList([]);
  }, [form.provinceId]);

  // 城市变化时加载区/县列表
  useEffect(() => {
    if (!form.cityId) {
      setDistrictsList([]);
      return;
    }
    const cityCode = String(form.cityId).padStart(4, "0");
    setDistrictsList(chinaAreas.filter((a) => a.cityCode === cityCode));
  }, [form.cityId]);

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

  // ── 校验 ──
  function validateStep(s: number): FieldErrors {
    const e: FieldErrors = {};
    if (s === 0) {
      const title = form.title.trim();
      if (title.length < 10) e.title = `标题至少 10 个字（当前 ${title.length}），建议写明产品和数量，例如"采购光伏组件 10MW"`;
      else if (title.length > 50) e.title = "标题不能超过 50 个字";
      if (!form.categoryL2) e.categoryL2 = "请选择产品/服务分类";
      const desc = form.description.trim();
      if (desc.length < 50) e.description = `描述至少 50 个字（当前 ${desc.length}），请补充用途、技术要求与验收标准`;
      else if (desc.length > 2000) e.description = "描述不能超过 2000 字";
    }
    if (s === 1) {
      if (!form.deadline) e.deadline = "请选择报价截止时间";
      else if (form.deadline < tomorrowIso()) e.deadline = "截止时间至少在 24 小时以后";
      if (!form.provinceId) e.province = "请选择省份";
      if (!form.budgetConfidential) {
        const min = form.budgetMin.trim();
        const max = form.budgetMax.trim();
        if (!min && !max) e.budget = "请填写预算区间，或勾选'预算保密'";
        else if (min && max && Number(min) > Number(max)) e.budget = "最低预算不能高于最高预算";
      }
    }
    if (s === 2) {
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

  function removeAttachment(idx: number) {
    setForm((prev) => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
  }

  // ── 提交：POST /api/rfq/create → PATCH /api/rfq/{id}/submit ──
  async function handleSubmit() {
    const e = validateStep(2);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      scrollToFirstError();
      return;
    }
    setSubmitting(true);
    try {
      // Step 1: 创建 RFQ
      const res = await api<{ code: number; data: { id: number } }>("/api/rfq/create", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          budget_min: form.budgetConfidential ? 0 : Number(form.budgetMin) || 0,
          budget_max: form.budgetConfidential ? 0 : Number(form.budgetMax) || 0,
          currency: form.currency,
          budget_confidential: form.budgetConfidential,
          country: "China",
          province_name: form.provinceName || "",
          category_l1_id: form.categoryL1 ? Number(form.categoryL1) : undefined,
          category_l2_id: form.categoryL2 ? Number(form.categoryL2) : undefined,
          delivery_address: [form.cityName, form.districtName, form.address].filter(Boolean).join(" "),
          incoterm: form.incoterm,
          delivery_time: form.deliveryTime,
          payment_terms: form.paymentTerms,
          deadline: form.deadline,
          visibility: form.visibility,
          supplier_reqs: form.supplierReqs,
          contact_name: form.contactName,
          contact_email: form.contactEmail,
          contact_phone: form.contactPhone,
          status: "draft",
        }),
      });
      const rfqId = res.data?.id;
      if (!rfqId) throw new Error("创建失败");

      // Step 2: 提交审核（状态变为 pending_review）
      await api(`/api/rfq/${rfqId}/submit`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });

      setSubmitted(true);
      onPublished();
    } catch (err) {
      const msg = (err as Error).message || "";
      // ApiError 格式: "标题至少 10 个字（当前 5）" 或 "Request failed: 400"
      const friendly = msg.includes("Request failed") ? "发布失败，请检查表单填写是否完整" : msg;
      setErrors({ _form: friendly });
      console.warn("[RfqWizard] submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── 发布成功态 ──
  if (submitted) {
    return (
      <div ref={rootRef} className="rounded-2xl border border-secondary-200 bg-white p-8 text-center shadow-xs">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 mb-4">
          <Check className="h-8 w-8 text-teal-600" />
        </div>
        <h3 className="text-lg font-extrabold text-secondary-900 mb-2">采购需求已提交</h3>
        <p className="text-sm text-secondary-500 mb-6">平台审核通过后将自动展示在需求广场，您可以随时在“我的采购需求”中查看或编辑。</p>
        <Button variant="primary" onClick={() => { setSubmitted(false); setForm(DEFAULT_RFQ_FORM); setStep(0); }}>
          发布新需求
        </Button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <StepIndicator step={step} />

      {/* ═══ Step 1 需求概要 ═══ */}
      {step === 0 && (
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
      )}

      {/* ═══ Step 2 商务条款 ═══ */}
      {step === 1 && (
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
              <label className="flex items-center gap-2 text-sm text-secondary-600 cursor-pointer">
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
      )}

      {/* ═══ Step 3 发布设置 ═══ */}
      {step === 2 && (
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
              <SummaryItem label="产品分类" value={[form.categoryL1, form.categoryL2].filter(Boolean).join(" / ")} onEdit={() => setStep(0)} />
              <SummaryItem label="预算" value={form.budgetConfidential ? "保密" : form.budgetMin || form.budgetMax ? `${form.currency} ${[form.budgetMin, form.budgetMax].filter(Boolean).join(" – ")} 万` : ""} onEdit={() => setStep(1)} />
              <SummaryItem label="交付地点" value={[form.provinceName, form.cityName, form.districtName, form.address].filter(Boolean).join(" ")} onEdit={() => setStep(1)} />
              <SummaryItem label="报价截止" value={form.deadline || ""} onEdit={() => setStep(1)} />
              <SummaryItem label="可见范围" value={form.visibility === "public" ? "公开询价" : "定向邀约"} onEdit={() => setStep(2)} />
              <SummaryItem label="附件" value={form.attachments.length ? `${form.attachments.length} 个文件` : ""} onEdit={() => setStep(2)} />
              <SummaryItem label="联系人" value={form.contactName || form.contactEmail || ""} onEdit={() => setStep(2)} />
            </dl>
          </div>
        </div>
      )}

      {/* ══ 底部导航按钮 ═══ */}
      {errors._form && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {errors._form}
        </div>
      )}
      <div className="flex items-center justify-between mt-8 pt-5 border-t border-secondary-100">
        {step > 0 ? (
          <Button variant="outline" onClick={goPrev}>
            <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
          </Button>
        ) : <div />}
        {step < STEP_META.length - 1 ? (
          <Button variant="primary" onClick={goNext}>
            下一步 <ChevronDown className="w-4 h-4 ml-1 -rotate-90" />
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <><span className="animate-spin mr-2">⏳</span> 发布中…</>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> 发布 RFQ</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
