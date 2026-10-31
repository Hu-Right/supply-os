/**
 * RFQ 向导分步校验（自 index.tsx 抽出，规则逐字不变）。
 *
 * @module features/rfq/components/RfqWizard/validation
 * @description 三步表单的字段校验纯函数：入参（步号、表单态、t），出参字段错误映射。
 *              抽出动因：index.tsx 331 行里校验占 35 行且与渲染混排，纯函数化后可单测。
 *              规则口径（长度阈值/必填项/邮箱正则）与原实现逐字一致，改动即漂移。
 */
import type { FieldErrors, RfqFormState } from "../../types";
import { tomorrowIso } from "./utils";

export type RfqTranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** 校验第 s 步（0=产品信息 / 1=商务条款 / 2=发布设置）；返回 { 字段: 错误文案 }，无错为空对象 */
export function validateRfqStep(s: number, form: RfqFormState, t: RfqTranslateFn): FieldErrors {
  const e: FieldErrors = {};
  if (s === 0) {
    const title = form.title.trim();
    if (title.length < 10) e.title = t("rfqErrTitleMin", { count: title.length });
    else if (title.length > 50) e.title = t("rfqErrTitleMax");
    if (!form.categoryL3) e.categoryL3 = t("rfqErrCategoryRequired");
    const desc = form.description.trim();
    if (desc.length < 50) e.description = t("rfqErrDescMin", { count: desc.length });
    else if (desc.length > 2000) e.description = t("rfqErrDescMax");
  }
  if (s === 1) {
    if (!form.deadline) e.deadline = t("rfqErrDeadlineRequired");
    else if (form.deadline < tomorrowIso()) e.deadline = t("rfqErrDeadlineTooSoon");
    if (!form.address.trim()) e.address = t("rfqErrAddressRequired");
    if (!form.incoterm) e.incoterm = t("rfqErrIncotermRequired");
    if (!form.deliveryTime.trim()) e.deliveryTime = t("rfqErrDeliveryTimeRequired");
    if (!form.budgetConfidential) {
      const budget = form.budget.trim();
      if (!budget) e.budget = t("rfqErrBudgetRequired");
      else if (!Number.isFinite(Number(budget)) || Number(budget) <= 0)
        e.budget = t("rfqErrBudgetInvalid");
    }
  }
  if (s === 2) {
    if (!form.contactName.trim()) e.contactName = t("rfqErrContactNameRequired");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) e.contactEmail = t("rfqErrContactEmailInvalid");
    if (!form.agreed) e.agreed = t("rfqErrAgreedRequired");
  }
  return e;
}
