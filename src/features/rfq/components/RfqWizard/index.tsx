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
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, Lock, Send,
} from "lucide-react";

import { Button, Spinner } from "@/shared/ui";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { fetchCommodityTreeChildren, type CommodityTreeOption } from "@/features/procurement/api/commodityTree";
import { DEFAULT_RFQ_FORM } from "../../constants";
import type { FieldErrors, RfqFormState } from "../../types";

import { STEP_META } from "./constants";
import { validateRfqStep } from "./validation";
import { StepIndicator } from "./ui/StepIndicator";
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
  const { t } = useLocale();

  if (!authUser) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-white p-12 text-center shadow-xs">
        <Lock className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-secondary-900 mb-2">{t("rfqWizardLoginRequired")}</h3>
        <p className="text-sm text-secondary-500 mb-6">{t("rfqWizardLoginDesc")}</p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>
          {t("rfqLoginCta")}
        </Button>
      </div>
    );
  }

  return <RfqWizardForm initialData={initialData} authContact={authContact} />;
}

function RfqWizardForm({ initialData, authContact }: RfqWizardProps) {

  // 注意：不用 Button asChild + Link——React 19 的 Children.toArray 不再过滤 false 子节点，
  // 会与 Radix Slot 单元素约束冲突导致渲染报错；改用 router.push 导航。
  const router = useRouter();
  const { t } = useLocale();
  const initialForm: RfqFormState = {
    ...initialData,
    description: initialData.description || t("rfqDescTemplate"),
  };
  const [form, setForm] = useState<RfqFormState>(initialForm);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── 品目分类（UGT 骨架树）：一级 = 32 个 L1 行，二级 = 中类，三级 = 小类（发布定位到小类）──
  const [l1Options, setL1Options] = useState<CommodityTreeOption[]>([]);
  const [l2Options, setL2Options] = useState<CommodityTreeOption[]>([]);
  const [l3Options, setL3Options] = useState<CommodityTreeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCommodityTreeChildren("")
      .then((rows) => { if (!cancelled) setL1Options(Array.isArray(rows) ? rows : []); })
      .catch((e) => { console.warn("[RfqWizard] 品目一级加载失败:", e); if (!cancelled) setL1Options([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!form.categoryL1) { setL2Options([]); return; }
    fetchCommodityTreeChildren(form.categoryL1)
      .then((rows) => setL2Options(Array.isArray(rows) ? rows : []))
      .catch((e) => { console.warn("[RfqWizard] 品目二级加载失败:", e); setL2Options([]); });
  }, [form.categoryL1]);

  useEffect(() => {
    if (!form.categoryL2) { setL3Options([]); return; }
    fetchCommodityTreeChildren(form.categoryL2)
      .then((rows) => setL3Options(Array.isArray(rows) ? rows : []))
      .catch((e) => { console.warn("[RfqWizard] 品目三级加载失败:", e); setL3Options([]); });
  }, [form.categoryL2]);

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

  /** 切换一级类目：重置二、三级；切换二级：重置三级 */
  function onCategoryL1(v: string) {
    setForm((prev) => ({ ...prev, categoryL1: v, categoryL2: "", categoryL3: "" }));
    setErrors((prev) => ({ ...prev, categoryL2: "", categoryL3: "" }));
  }

  function onCategoryL2(v: string) {
    setForm((prev) => ({ ...prev, categoryL2: v, categoryL3: "" }));
    setErrors((prev) => ({ ...prev, categoryL3: "" }));
  }

  /** 产品分类展示文案：三级全取品目树名称（供第三步摘要核对） */
  const categoryDisplay = (() => {
    const l1Name = l1Options.find((o) => o.key === form.categoryL1)?.nameZh || "";
    const l2Pick = l2Options.find((o) => String(o.key) === String(form.categoryL2));
    const l2Name = l2Pick ? l2Pick.nameZh || l2Pick.nameEn || l2Pick.key : "";
    const l3Pick = l3Options.find((o) => String(o.key) === String(form.categoryL3));
    const l3Name = l3Pick ? l3Pick.nameZh || l3Pick.nameEn || l3Pick.key : "";
    return [l1Name, l2Name, l3Name].filter(Boolean).join(" / ");
  })();

  // ── 校验（纯函数在 ./validation，规则口径见彼处注释）──
  const validateStep = (step: number): FieldErrors => validateRfqStep(step, form, t);

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
      // api() 内部已 JSON.stringify，body 直接传对象（切勿二次 stringify）
      const res = await api<{ id: number }>("/api/rfq/create", {
        method: "POST",
        body: {
          title: form.title.trim(),
          description: form.description.trim(),
          budget: form.budgetConfidential ? 0 : Number(form.budget) || 0,
          budget_confidential: form.budgetConfidential,
          currency: form.currency || "CNY",
          country: "China",
          category_code: form.categoryL3 || form.categoryL2 || form.categoryL1 || undefined,
          delivery_address: form.address.trim(),
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
        },
      });
      const rfqId = res?.id;
      if (!rfqId) throw new Error(t("rfqCreateFailed"));
      await api(`/api/rfq/${rfqId}/submit`, { method: "PATCH", body: {} });
      setSubmitted(true);
    } catch (err) {
      const msg = (err as Error).message || "";
      const friendly = msg.includes("Request failed") ? t("rfqPublishFailedFallback") : msg;
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
        <h3 className="text-lg font-extrabold text-secondary-900 mb-2">{t("rfqSubmittedTitle")}</h3>
        <p className="text-sm text-secondary-500 mb-6">{t("rfqSubmittedDesc")}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.push("/settings/rfq")}>{t("rfqViewMyRfqs")}</Button>
          <Button variant="primary" onClick={() => { setSubmitted(false); setForm(DEFAULT_RFQ_FORM); setStep(0); }}>
            {t("rfqPublishNew")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <StepIndicator step={step} />

      {step === 0 && (
        <Step1ProductInfo
          form={form} errors={errors} update={update}
          onCategoryL1={onCategoryL1} onCategoryL2={onCategoryL2}
          l1Options={l1Options} l2Options={l2Options} l3Options={l3Options}
        />
      )}

      {step === 1 && (
        <Step2BusinessTerms
          form={form} errors={errors} update={update}
        />
      )}

      {step === 2 && (
        <Step3PublishSettings
          form={form} errors={errors} update={update}
          termsOpen={termsOpen} setTermsOpen={setTermsOpen} setStep={setStep}
          categoryDisplay={categoryDisplay}
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
            <ChevronLeft className="w-4 h-4 mr-1" /> {t("rfqPrevStep")}
          </Button>
        ) : <div />}
        {step < STEP_META.length - 1 ? (
          <Button variant="primary" onClick={goNext}>
            {t("rfqNextStep")} <ChevronDown className="w-4 h-4 ml-1 -rotate-90" />
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <><Spinner className="w-4 h-4 mr-2" aria-hidden="true" /><span aria-live="polite">{t("rfqPublishing")}</span></>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> {t("rfqPublishRfq")}</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
