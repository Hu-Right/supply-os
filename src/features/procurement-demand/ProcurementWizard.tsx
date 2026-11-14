"use client";

/**
 * 采购需求发布向导（新发布域，按全案 F02/F03 结构化）
 * @module features/procurement-demand/ProcurementWizard
 *
 * @description 三步向导：①基础信息 ②采购明细与附件 ③商务条款与发布设置。
 *              提交语义 = 「确认最终版本」（流程第 3 步）：冻结快照+版本+1，
 *              成功后跳授权书签署页（第 4/5 步）。编辑模式：加载已有项目回填，
 *              重新提交即新版本（旧授权自动失效须重签）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { fetchCommodityTreeChildren, type CommodityTreeOption } from "@/core/api/commodityTree";
import { api } from "@/core/http";
import {
  createProject,
  fetchProject,
  patchProject,
  replaceItems,
  submitProject,
  type ItemDraft,
  type ProjectDetail,
} from "./api";

interface FormState {
  titleZh: string;
  titleEn: string;
  background: string;
  purpose: string;
  internalProjectNo: string;
  objectTypes: string[];
  categoryL1: string;
  categoryL2: string;
  categoryL3: string;
  budgetAmount: string;
  budgetCurrency: string;
  budgetPublic: boolean;
  budgetApproved: string;
  deliveryCountry: string;
  deliveryCity: string;
  deliveryAddress: string;
  deadlineDate: string;
  installNeeds: string[];
  incoterm: string;
  paymentTerms: string;
  guarantees: string[];
  manufacturerOnly: boolean;
  supplierQuals: string;
  quoteDeadlineDate: string;
  complianceFlags: string[];
  complianceNote: string;
  authorizePublish: boolean;
  contactDisclosure: string;
}

const DEFAULT_FORM: FormState = {
  titleZh: "",
  titleEn: "",
  background: "",
  purpose: "real",
  internalProjectNo: "",
  objectTypes: ["goods"],
  categoryL1: "",
  categoryL2: "",
  categoryL3: "",
  budgetAmount: "",
  budgetCurrency: "CNY",
  budgetPublic: false,
  budgetApproved: "approved",
  deliveryCountry: "",
  deliveryCity: "",
  deliveryAddress: "",
  deadlineDate: "",
  installNeeds: [],
  incoterm: "",
  paymentTerms: "",
  guarantees: [],
  manufacturerOnly: false,
  supplierQuals: "",
  quoteDeadlineDate: "",
  complianceFlags: [],
  complianceNote: "",
  authorizePublish: true,
  contactDisclosure: "org_only",
};

const PURPOSE_OPTIONS = ["real", "budgeting", "research", "future_plan"];
const OBJECT_OPTIONS = ["goods", "engineering", "service", "solution"];
const INSTALL_OPTIONS = ["installation", "commissioning", "training"];
const GUARANTEE_OPTIONS = ["bid_bond", "performance_bond", "warranty_deposit"];
const COMPLIANCE_OPTIONS = ["export_control", "dangerous", "medical", "dual_use", "other"];
const INCOTERM_OPTIONS = ["EXW", "FOB", "CIF", "DDP"];

interface ItemRow {
  nameZh: string;
  spec: string;
  quantity: string;
  qtyUnit: string;
}

export function ProcurementWizard(props: { editId?: number }) {
  const { t } = useLocale();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [items, setItems] = useState<ItemRow[]>([{ nameZh: "", spec: "", quantity: "", qtyUnit: "件" }]);
  const [files, setFiles] = useState<File[]>([]);
  const [l1Options, setL1Options] = useState<CommodityTreeOption[]>([]);
  const [l2Options, setL2Options] = useState<CommodityTreeOption[]>([]);
  const [l3Options, setL3Options] = useState<CommodityTreeOption[]>([]);
  const [projectId, setProjectId] = useState<number | null>(props.editId ?? null);
  const [loading, setLoading] = useState(Boolean(props.editId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const field = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  // UGT 骨架树（复用现有 commodityTree API；发布定位到小类）
  useEffect(() => {
    let cancelled = false;
    fetchCommodityTreeChildren("")
      .then((rows) => { if (!cancelled) setL1Options(rows); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!form.categoryL1) { setL2Options([]); return; }
    let cancelled = false;
    fetchCommodityTreeChildren(form.categoryL1)
      .then((rows) => { if (!cancelled) setL2Options(rows); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [form.categoryL1]);
  useEffect(() => {
    if (!form.categoryL2) { setL3Options([]); return; }
    let cancelled = false;
    fetchCommodityTreeChildren(form.categoryL2)
      .then((rows) => { if (!cancelled) setL3Options(rows); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [form.categoryL2]);

  // 编辑模式回填
  useEffect(() => {
    if (!props.editId) return;
    let cancelled = false;
    fetchProject(props.editId)
      .then((d: ProjectDetail) => {
        if (cancelled) return;
        setForm((p: FormState) => ({
          ...p,
          titleZh: d.titleZh,
          titleEn: d.titleEn,
          background: d.background,
          purpose: d.purpose || "real",
          internalProjectNo: d.internalProjectNo,
          objectTypes: d.objectTypes.length ? d.objectTypes : ["goods"],
          budgetAmount: d.budgetAmount == null ? "" : String(d.budgetAmount),
          budgetCurrency: d.budgetCurrency || "CNY",
          budgetPublic: d.budgetAmount != null,
          budgetApproved: d.budgetApproved || "approved",
          deliveryCountry: d.deliveryCountry,
          deliveryCity: d.deliveryCity,
          deliveryAddress: d.deliveryAddress,
          deadlineDate: d.deadlineDate,
          installNeeds: d.installNeeds,
          incoterm: d.incoterm,
          paymentTerms: d.paymentTerms,
          guarantees: d.guarantees,
          manufacturerOnly: d.manufacturerOnly,
          supplierQuals: d.supplierQuals,
          quoteDeadlineDate: d.quoteDeadlineAt ? new Date(d.quoteDeadlineAt * 1000).toISOString().slice(0, 10) : "",
          complianceFlags: d.compliance && Array.isArray(d.compliance.flags) ? (d.compliance.flags as string[]) : [],
          complianceNote: d.compliance && typeof d.compliance.note === "string" ? d.compliance.note : "",
          authorizePublish: true,
          contactDisclosure: "org_only",
          categoryL3: d.items[0]?.ugtCode ?? d.primaryUgtCode ?? "",
          categoryL2: (d.items[0]?.ugtCode ?? d.primaryUgtCode ?? "").slice(0, 7),
          categoryL1: (d.items[0]?.ugtCode ?? d.primaryUgtCode ?? "").slice(0, 6),
        }));
        setItems(
          d.items.length
            ? d.items.map((it) => ({ nameZh: it.nameZh, spec: it.spec, quantity: it.quantity == null ? "" : String(it.quantity), qtyUnit: it.qtyUnit }))
            : [{ nameZh: "", spec: "", quantity: "", qtyUnit: "件" }],
        );
        setLoading(false);
      })
      .catch((err) => { if (!cancelled) { setError((err as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [props.editId]);

  const derivedUgt = useMemo(() => form.categoryL3 || form.categoryL2 || form.categoryL1 || "", [form.categoryL1, form.categoryL2, form.categoryL3]);

  const buildPatch = useCallback((): Record<string, unknown> => ({
    titleZh: form.titleZh.trim(),
    titleEn: form.titleEn.trim() || null,
    background: form.background.trim() || null,
    purpose: form.purpose,
    internalProjectNo: form.internalProjectNo.trim() || null,
    objectTypes: form.objectTypes.join(",") || "goods",
    budgetAmount: form.budgetAmount === "" ? null : Number(form.budgetAmount),
    budgetCurrency: form.budgetCurrency,
    budgetPublic: form.budgetPublic ? 1 : 0,
    budgetApproved: form.budgetApproved || null,
    deliveryCountry: form.deliveryCountry.trim() || null,
    deliveryCity: form.deliveryCity.trim() || null,
    deliveryAddress: form.deliveryAddress.trim() || null,
    deadlineDate: form.deadlineDate || null,
    installNeeds: form.installNeeds.join(",") || null,
    logisticsNote: null,
    incoterm: form.incoterm || null,
    paymentTerms: form.paymentTerms.trim() || null,
    guarantees: form.guarantees.join(",") || null,
    supplierCountryLimit: null,
    manufacturerOnly: form.manufacturerOnly ? 1 : 0,
    supplierQuals: form.supplierQuals.trim() || null,
    quoteDeadlineAt: form.quoteDeadlineDate ? Math.floor(new Date(`${form.quoteDeadlineDate}T23:59:59+08:00`).getTime() / 1000) : null,
    supplierConfirmDate: null,
    contractDate: null,
    compliance: JSON.stringify({
      flags: form.complianceFlags,
      note: form.complianceNote.trim() || null,
    }),
    authorizePublish: form.authorizePublish ? 1 : 0,
    contactDisclosure: form.contactDisclosure,
  }), [form]);

  const saveDraft = async (): Promise<number | null> => {
    let pid = projectId;
    if (!pid) {
      const created = await createProject();
      pid = created.id;
      setProjectId(pid);
    }
    await patchProject(pid, buildPatch());
    await replaceItems(
      pid,
      [],
      items
        .filter((it) => it.nameZh.trim())
        .map<ItemDraft>((it) => ({
          nameZh: it.nameZh.trim(),
          spec: it.spec.trim() || undefined,
          quantity: it.quantity === "" ? undefined : Number(it.quantity),
          qtyUnit: it.qtyUnit || "件",
          ugtCode: derivedUgt || undefined,
        })),
    );
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", "requirement");
      await api(`/api/procurement/projects/${pid}/attachments`, { method: "POST", body: fd });
    }
    return pid;
  };

  const validate = (): string => {
    if (!form.titleZh.trim()) return t("pc_err_title");
    if (items.filter((it) => it.nameZh.trim()).length === 0) return t("pc_err_items");
    if (!derivedUgt) return t("pc_err_category");
    return "";
  };

  const onSubmit = async () => {
    const msg = validate();
    if (msg) { setError(msg); return; }
    setSubmitting(true);
    setError("");
    try {
      const pid = await saveDraft();
      if (!pid) throw new Error(t("pc_err_generic"));
      const r = await submitProject(pid);
      router.push(`/settings/rfq/${pid}/authorization-letter`);
      void r;
    } catch (err) {
      setError((err as Error).message || t("pc_err_generic"));
      setSubmitting(false);
    }
  };

  const onSaveDraft = async () => {
    setSubmitting(true);
    setError("");
    try {
      const pid = await saveDraft();
      if (pid) router.push("/settings/rfq");
      else throw new Error(t("pc_err_generic"));
    } catch (err) {
      setError((err as Error).message || t("pc_err_generic"));
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-secondary-400">{t("pc_loading")}</div>;

  const STEPS = [t("pc_step1"), t("pc_step2"), t("pc_step3")];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div ref={rootRef} className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${step === i ? "bg-teal-600 text-white" : "bg-secondary-100 text-secondary-600"}`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-4">
          <label className="text-sm font-semibold text-secondary-700">
            {t("pc_titleZh")} *
            <input value={form.titleZh} onChange={(e) => field("titleZh", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-semibold text-secondary-700">
            {t("pc_titleEn")}
            <input value={form.titleEn} onChange={(e) => field("titleEn", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-semibold text-secondary-700">
            {t("pc_background")}
            <textarea value={form.background} onChange={(e) => field("background", e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_purpose")} *
              <select value={form.purpose} onChange={(e) => field("purpose", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm">
                {PURPOSE_OPTIONS.map((p) => <option key={p} value={p}>{t(`pc_purpose_${p}`)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_internalNo")}
              <input value={form.internalProjectNo} onChange={(e) => field("internalProjectNo", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="text-sm font-semibold text-secondary-700">
            {t("pc_objectTypes")} *
            <div className="mt-1 flex flex-wrap gap-2">
              {OBJECT_OPTIONS.map((o) => (
                <button key={o} type="button" onClick={() => field("objectTypes", toggle(form.objectTypes, o))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.objectTypes.includes(o) ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                  {t(`pc_obj_${o}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4">
          <div className="text-sm font-semibold text-secondary-700">
            {t("pc_category")} *
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <select value={form.categoryL1} onChange={(e) => { field("categoryL1", e.target.value); field("categoryL2", ""); field("categoryL3", ""); }} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm">
                <option value="">{t("pc_category_l1")}</option>
                {l1Options.map((o) => <option key={o.key} value={o.key}>{o.nameZh}</option>)}
              </select>
              <select value={form.categoryL2} onChange={(e) => { field("categoryL2", e.target.value); field("categoryL3", ""); }} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" disabled={!form.categoryL1}>
                <option value="">{t("pc_category_l2")}</option>
                {l2Options.map((o) => <option key={o.key} value={o.key}>{o.nameZh}</option>)}
              </select>
              <select value={form.categoryL3} onChange={(e) => field("categoryL3", e.target.value)} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" disabled={!form.categoryL2}>
                <option value="">{t("pc_category_l3")}</option>
                {l3Options.map((o) => <option key={o.key} value={o.key}>{o.nameZh}</option>)}
              </select>
            </div>
            <p className="mt-1 text-xs text-secondary-400">{t("pc_category_hint")}</p>
          </div>

          <div className="text-sm font-semibold text-secondary-700">
            {t("pc_items")} *
            <div className="mt-1 grid gap-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border border-secondary-200 p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
                  <input placeholder={t("pc_item_name")} value={it.nameZh} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, nameZh: e.target.value } : x)))} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <input placeholder={t("pc_item_spec")} value={it.spec} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, spec: e.target.value } : x)))} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <input placeholder={t("pc_item_qty")} value={it.quantity} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <input placeholder={t("pc_item_unit")} value={it.qtyUnit} onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, qtyUnit: e.target.value } : x)))} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))} className="rounded-lg border border-secondary-300 px-2 text-xs text-secondary-500">✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((p) => [...p, { nameZh: "", spec: "", quantity: "", qtyUnit: "件" }])} className="mt-2 rounded-lg border border-dashed border-secondary-300 px-3 py-2 text-xs text-secondary-500">
              + {t("pc_item_add")}
            </button>
          </div>

          <label className="text-sm font-semibold text-secondary-700">
            {t("pc_attachments")}
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="mt-1 w-full text-sm" />
            <span className="mt-1 block text-xs text-secondary-400">{t("pc_attachments_hint")}</span>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_budget")}
              <input value={form.budgetAmount} onChange={(e) => field("budgetAmount", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_currency")}
              <select value={form.budgetCurrency} onChange={(e) => field("budgetCurrency", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm">
                {["CNY", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_budgetApproved")}
              <select value={form.budgetApproved} onChange={(e) => field("budgetApproved", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm">
                {["approved", "partial", "pending", "applying"].map((v) => <option key={v} value={v}>{t(`pc_budget_${v}`)}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-secondary-700">
            <input type="checkbox" checked={form.budgetPublic} onChange={(e) => field("budgetPublic", e.target.checked)} />
            {t("pc_budgetPublic")}
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_deliveryCountry")} *
              <input value={form.deliveryCountry} onChange={(e) => field("deliveryCountry", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_deliveryCity")} *
              <input value={form.deliveryCity} onChange={(e) => field("deliveryCity", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_deadlineDate")}
              <input type="date" value={form.deadlineDate} onChange={(e) => field("deadlineDate", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_incoterm")}
              <select value={form.incoterm} onChange={(e) => field("incoterm", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm">
                <option value="">--</option>
                {INCOTERM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-secondary-700">
              {t("pc_quoteDeadline")} *
              <input type="date" value={form.quoteDeadlineDate} onChange={(e) => field("quoteDeadlineDate", e.target.value)} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
            </label>
          </div>

          <label className="text-sm font-semibold text-secondary-700">
            {t("pc_paymentTerms")}
            <textarea value={form.paymentTerms} onChange={(e) => field("paymentTerms", e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
          </label>

          <div className="text-sm font-semibold text-secondary-700">
            {t("pc_compliance")}
            <div className="mt-1 flex flex-wrap gap-2">
              {COMPLIANCE_OPTIONS.map((o) => (
                <button key={o} type="button" onClick={() => field("complianceFlags", toggle(form.complianceFlags, o))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.complianceFlags.includes(o) ? "border-amber-500 bg-amber-50 text-amber-700" : "border-secondary-300 text-secondary-600"}`}>
                  {t(`pc_comp_${o}`)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-secondary-700">
            <input type="checkbox" checked={form.authorizePublish} onChange={(e) => field("authorizePublish", e.target.checked)} />
            {t("pc_authorizePublish")} *
          </label>
        </div>
      )}

      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="mt-5 flex items-center justify-between">
        <button type="button" disabled={submitting} onClick={onSaveDraft} className="rounded-lg border border-secondary-300 px-4 py-2 text-sm font-semibold text-secondary-600 disabled:opacity-50">
          {t("pc_save_draft")}
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-lg border border-secondary-300 px-4 py-2 text-sm font-semibold text-secondary-600">
              {t("pc_prev")}
            </button>
          )}
          {step < 2 ? (
            <button type="button" onClick={() => { const m = validate(); if (m && step === 1) { setError(m); return; } setError(""); setStep((s) => s + 1); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              {t("pc_next")}
            </button>
          ) : (
            <button type="button" disabled={submitting} onClick={onSubmit} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? t("pc_submitting") : t("pc_submit_confirm")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
