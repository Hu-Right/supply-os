"use client";

/**
 * RFQ 编辑页 — 账户设置子页
 * RFQ Edit Page — Settings Sub-page
 *
 * @module app/(public)/settings/rfq/[id]/edit/page-client
 * @description 仅创建者、仅 draft / pending_review / rejected 状态可编辑
 *              （rejected 可修改后重新提审，与列表页"编辑"入口口径一致）。
 *              保存走 PATCH /api/rfq/[id]（编辑后状态回退 draft），
 *              "保存并提交审核" 追加 PATCH /submit 回到 pending_review。
 *              由门户 /rfq/[id]/edit 迁入；api() body 直传对象（勿再 stringify）。
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { api } from "@/core/http";
import { useLocale } from "@/core/i18n";
import { Button, Card } from "@/shared/ui";

interface RfqEditData {
  id: number;
  title: string;
  description: string;
  status: string;
  budget: number | null;
  budgetConfidential: boolean;
  currency: string;
  incoterm: string;
  deliveryTime: string;
  deliveryAddress: string;
  paymentTerms: string[];
  supplierReqs: string[];
  deadlineSec: number;
  isOwner: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"];
const CURRENCIES = [
  { value: "CNY", labelKey: "rfqEditCurrencyCny" },
  { value: "USD", labelKey: "rfqEditCurrencyUsd" },
  { value: "EUR", labelKey: "rfqEditCurrencyEur" },
  { value: "GBP", labelKey: "rfqEditCurrencyGbp" },
  { value: "JPY", labelKey: "rfqEditCurrencyJpy" },
  { value: "HKD", labelKey: "rfqEditCurrencyHkd" },
];

const EDITABLE_STATUSES = ["draft", "rejected"];

function secToDateInput(sec: number): string {
  if (!sec) return "";
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function label(text: string) {
  return <label className="block text-xs font-bold text-secondary-700 mb-1.5">{text}</label>;
}

const inputCls =
  "w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

export default function RfqEditSettingsPageClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLocale();
  const id = params?.id;

  const [data, setData] = useState<RfqEditData | null>(null);
  const [deadline, setDeadline] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [paymentText, setPaymentText] = useState("");
  const [reqText, setReqText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState("");

  useEffect(() => {
    if (!id) return;
    api<RfqEditData>(`/api/rfq/demands/${id}`)
      .then((res) => {
        const d = res;
        if (!d.isOwner) {
          setDenied("rfqEditDeniedOwner");
          return;
        }
        if (!EDITABLE_STATUSES.includes(d.status)) {
          setDenied("rfqEditDeniedStatus");
          return;
        }
        setData(d);
        setDeadline(secToDateInput(d.deadlineSec));
        setBudget(d.budget ? String(d.budget) : "");
        setCurrency(d.currency || "CNY");
        setPaymentText(d.paymentTerms.join("、"));
        setReqText(d.supplierReqs.join("、"));
      })
      .catch((err: Error) => setDenied(err.message || "rfqLoadFailed"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save(withSubmit: boolean) {
    if (!data || !id) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/rfq/demands/${id}`, {
        method: "PATCH",
        body: {
          title: data.title,
          description: data.description,
          deadline,
          budget: Number(budget) || 0,
          budget_confidential: data.budgetConfidential,
          currency,
          incoterm: data.incoterm,
          delivery_time: data.deliveryTime,
          delivery_address: data.deliveryAddress,
          payment_terms: paymentText.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
          supplier_reqs: reqText.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
          contact_name: data.contactName,
          contact_email: data.contactEmail,
          contact_phone: data.contactPhone,
        },
      });
      if (withSubmit) {
        await api(`/api/rfq/demands/${id}/submit`, { method: "POST", body: {} });
      }
      router.push("/settings/rfq");
    } catch (err) {
      setError((err as Error).message || t("capSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-secondary-400">{t("rfqLoading")}</div>;
  }

  if (denied || !data) {
    // denied 里存的是 i18n 键（无权限/状态不满足）或接口错误原文：
    // t(键) 命中即翻译，未命中说明是后端原文，回落原样展示
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <Lock className="w-10 h-10 text-secondary-300 mx-auto" />
        <p className="text-sm text-secondary-500">{denied ? t(denied) || denied : t("rfqNotFound")}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/settings/rfq")}>{t("rfqEditBackToMyRfqs")}</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-secondary-900">{t("rfqEditTitle")}</h2>
        <p className="text-xs text-secondary-400 mt-1">
          {t("rfqEditHeaderNote", { id: data.id })}
        </p>
      </div>

      <Card className="rounded-2xl p-6 space-y-5">
        <div>
          {label(t("rfqEditLabelTitle"))}
          <input
            className={inputCls}
            value={data.title}
            maxLength={50}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </div>

        <div>
          {label(t("rfqEditLabelDesc"))}
          <textarea
            className={`${inputCls} min-h-40 resize-y`}
            value={data.description}
            maxLength={2000}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {label(t("rfqFieldBudget"))}
            <input
              type="number" min="0" className={inputCls}
              value={budget}
              disabled={data.budgetConfidential}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={t("rfqBudgetPlaceholder")}
            />
          </div>
          <div>
            {label(t("rfqQuoteCurrencyLabel"))}
            <select
              className={inputCls}
              value={currency}
              disabled={data.budgetConfidential}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {label(t("rfqEditLabelDeadline"))}
            <input
              type="date"
              className={inputCls}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div>
            {label(t("rfqTermIncoterm"))}
            <select
              className={inputCls}
              value={data.incoterm}
              onChange={(e) => setData({ ...data, incoterm: e.target.value })}
            >
              <option value="">{t("rfqEditUnspecified")}</option>
              {INCOTERMS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div>
            {label(t("rfqFieldDeliveryTime"))}
            <input
              className={inputCls}
              value={data.deliveryTime}
              maxLength={200}
              onChange={(e) => setData({ ...data, deliveryTime: e.target.value })}
            />
          </div>
        </div>

        <div>
          {label(t("rfqFieldAddress"))}
          <input
            className={inputCls}
            value={data.deliveryAddress}
            maxLength={500}
            onChange={(e) => setData({ ...data, deliveryAddress: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {label(t("rfqEditLabelPayment"))}
            <input className={inputCls} value={paymentText} onChange={(e) => setPaymentText(e.target.value)} />
          </div>
          <div>
            {label(t("rfqEditLabelSupplierReqs"))}
            <input className={inputCls} value={reqText} onChange={(e) => setReqText(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            {label(t("authEnterpriseContact"))}
            <input
              className={inputCls} value={data.contactName} maxLength={100}
              onChange={(e) => setData({ ...data, contactName: e.target.value })}
            />
          </div>
          <div>
            {label(t("rfqFieldContactEmail"))}
            <input
              className={inputCls} value={data.contactEmail} maxLength={200}
              onChange={(e) => setData({ ...data, contactEmail: e.target.value })}
            />
          </div>
          <div>
            {label(t("rfqFieldContactPhone"))}
            <input
              className={inputCls} value={data.contactPhone} maxLength={50}
              onChange={(e) => setData({ ...data, contactPhone: e.target.value })}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button size="sm" disabled={saving} onClick={() => save(true)}>
            {saving ? t("capSaving") : t("rfqEditSaveAndSubmit")}
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save(false)}>
            {t("rfqEditSaveDraft")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push("/settings/rfq")}>{t("cancel")}</Button>
        </div>
      </Card>
    </div>
  );
}
