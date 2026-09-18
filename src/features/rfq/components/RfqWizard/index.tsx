"use client";

/**
 * RFQ 三步发布向导（拆分后主入口）
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
  AlertTriangle, Check, ChevronDown, ChevronLeft, Lock, Send,
} from "lucide-react";

import { Button } from "@/shared/ui";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { fetchUnspscIndustries, fetchUnspscChildren, type UnspscOption } from "@/core/unspsc";
import { DEFAULT_RFQ_FORM } from "../../constants";
import type { FieldErrors, RfqFormState } from "../../types";

import { DESCRIPTION_TEMPLATE, STEP_META, MAX_FILE_SIZE, MAX_FILE_COUNT } from "./constants";
import { tomorrowIso } from "./utils";
import { StepIndicator } from "./ui/StepIndicator";
import { useLocationData } from "./hooks/useLocationData";
import { Step1ProductInfo } from "./steps/Step1ProductInfo";
import { Step2BusinessTerms } from "./steps/Step2BusinessTerms";
import { Step3PublishSettings } from "./steps/Step3PublishSettings";

interface RfqWizardProps {
  initialData: RfqFormState;
  /** 登录态联系方式预填 */
  authContact: { name: string; email: string };
}

/**
 * 登录门槛外壳：只调用 useAuth 一个 Hook 并做提前返回，
 * 向导本体的全部 Hook 收敛在 RfqWizardForm 内，避免条件 Hook 调用
 * （未登录 → 登录时 Hook 数量变化会导致 React 崩溃）。
 */
export function RfqWizard({ initialData, authContact }: RfqWizardProps) {
  const { authUser } = useAuth();

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

  return <RfqWizardForm initialData={initialData} authContact={authContact} />;
}

function RfqWizardForm({ initialData, authContact }: RfqWizardProps) {
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

  // ── UNSPSC 分类数据 ──
  const [l1Options, setL1Options] = useState<UnspscOption[]>([]);
  const [l2Options, setL2Options] = useState<UnspscOption[]>([]);

  useEffect(() => {
    fetchUnspscIndustries().then(setL1Options).catch((e) => { console.warn("[RfqWizard] UNSPSC L1 加载失败:", e); setL1Options([]); });
  }, []);

  useEffect(() => {
    if (!form.categoryL1) { setL2Options([]); return; }
    fetchUnspscChildren(form.categoryL1).then(setL2Options).catch((e) => { console.warn("[RfqWizard] UNSPSC L2 加载失败:", e); setL2Options([]); });
  }, [form.categoryL1]);

  // ── 省市区级联 ──
  const { citiesList, districtsList } = useLocationData(form);

  /** 联系方式登录态预填（仅在字段为空时，不覆盖已填内容） */
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
        const budget = form.budget.trim();
        if (!budget) e.budget = "请填写预算金额，或勾选'预算保密'";
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
      const res = await api<{ code: number; data: { id: number } }>("/api/rfq/create", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          budget: form.budgetConfidential ? 0 : Number(form.budget) || 0,
          budget_confidential: form.budgetConfidential,
          currency: form.currency || "CNY",
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
      await api(`/api/rfq/${rfqId}/submit`, { method: "PATCH", body: JSON.stringify({}) });
      setSubmitted(true);
    } catch (err) {
      const msg = (err as Error).message || "";
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
        <p className="text-sm text-secondary-500 mb-6">平台审核通过后将自动展示在需求广场，您可以随时在"我的采购需求"中查看或编辑。</p>
        <Button variant="primary" onClick={() => { setSubmitted(false); setForm(DEFAULT_RFQ_FORM); setStep(0); }}>
          发布新需求
        </Button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <StepIndicator step={step} />

      {step === 0 && (
        <Step1ProductInfo
          form={form} errors={errors} update={update} onCategoryL1={onCategoryL1}
          l1Options={l1Options} l2Options={l2Options}
        />
      )}

      {step === 1 && (
        <Step2BusinessTerms
          form={form} errors={errors} update={update}
          citiesList={citiesList} districtsList={districtsList}
        />
      )}

      {step === 2 && (
        <Step3PublishSettings
          form={form} errors={errors} update={update}
          termsOpen={termsOpen} setTermsOpen={setTermsOpen} setStep={setStep}
        />
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
