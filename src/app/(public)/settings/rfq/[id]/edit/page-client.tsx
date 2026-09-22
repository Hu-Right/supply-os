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
  { value: "CNY", label: "人民币 (CNY)" },
  { value: "USD", label: "美元 (USD)" },
  { value: "EUR", label: "欧元 (EUR)" },
  { value: "GBP", label: "英镑 (GBP)" },
  { value: "JPY", label: "日元 (JPY)" },
  { value: "HKD", label: "港币 (HKD)" },
];

const EDITABLE_STATUSES = ["draft", "pending_review", "rejected"];

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
    api<{ code: number; data: RfqEditData }>(`/api/rfq/${id}`)
      .then((res) => {
        const d = res.data;
        if (!d.isOwner) {
          setDenied("仅创建者可编辑此需求");
          return;
        }
        if (!EDITABLE_STATUSES.includes(d.status)) {
          setDenied("仅草稿、待审核或审核未通过状态可编辑");
          return;
        }
        setData(d);
        setDeadline(secToDateInput(d.deadlineSec));
        setBudget(d.budget ? String(d.budget) : "");
        setCurrency(d.currency || "CNY");
        setPaymentText(d.paymentTerms.join("、"));
        setReqText(d.supplierReqs.join("、"));
      })
      .catch((err: Error) => setDenied(err.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save(withSubmit: boolean) {
    if (!data || !id) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/rfq/${id}`, {
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
        await api(`/api/rfq/${id}/submit`, { method: "PATCH", body: {} });
      }
      router.push("/settings/rfq");
    } catch (err) {
      setError((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-secondary-400">加载中…</div>;
  }

  if (denied || !data) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <Lock className="w-10 h-10 text-secondary-300 mx-auto" />
        <p className="text-sm text-secondary-500">{denied || "需求不存在"}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/settings/rfq")}>返回我的需求</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-secondary-900">编辑采购需求</h2>
        <p className="text-xs text-secondary-400 mt-1">
          #{data.id} · 保存后将回到草稿状态，可重新提交审核
        </p>
      </div>

      <Card className="rounded-2xl p-6 space-y-5">
        <div>
          {label("需求标题（10-50 字）")}
          <input
            className={inputCls}
            value={data.title}
            maxLength={50}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </div>

        <div>
          {label("需求描述（50-2000 字）")}
          <textarea
            className={`${inputCls} min-h-40 resize-y`}
            value={data.description}
            maxLength={2000}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {label("预算金额")}
            <input
              type="number" min="0" className={inputCls}
              value={budget}
              disabled={data.budgetConfidential}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="预算金额"
            />
          </div>
          <div>
            {label("币种")}
            <select
              className={inputCls}
              value={currency}
              disabled={data.budgetConfidential}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {label("报价截止日期")}
            <input
              type="date"
              className={inputCls}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div>
            {label("贸易术语")}
            <select
              className={inputCls}
              value={data.incoterm}
              onChange={(e) => setData({ ...data, incoterm: e.target.value })}
            >
              <option value="">未指定</option>
              {INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            {label("交付时间")}
            <input
              className={inputCls}
              value={data.deliveryTime}
              maxLength={200}
              onChange={(e) => setData({ ...data, deliveryTime: e.target.value })}
            />
          </div>
        </div>

        <div>
          {label("交付地点")}
          <input
            className={inputCls}
            value={data.deliveryAddress}
            maxLength={500}
            onChange={(e) => setData({ ...data, deliveryAddress: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {label("付款方式（顿号/逗号分隔）")}
            <input className={inputCls} value={paymentText} onChange={(e) => setPaymentText(e.target.value)} />
          </div>
          <div>
            {label("供应商要求（顿号/逗号分隔）")}
            <input className={inputCls} value={reqText} onChange={(e) => setReqText(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            {label("联系人")}
            <input
              className={inputCls} value={data.contactName} maxLength={100}
              onChange={(e) => setData({ ...data, contactName: e.target.value })}
            />
          </div>
          <div>
            {label("联系邮箱")}
            <input
              className={inputCls} value={data.contactEmail} maxLength={200}
              onChange={(e) => setData({ ...data, contactEmail: e.target.value })}
            />
          </div>
          <div>
            {label("联系电话")}
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
            {saving ? "保存中…" : "保存并提交审核"}
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save(false)}>
            仅保存草稿
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push("/settings/rfq")}>取消</Button>
        </div>
      </Card>
    </div>
  );
}
