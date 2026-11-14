"use client";

/**
 * 采购需求发布向导（全案 F02 六页结构）
 * @module features/procurement-demand/ProcurementWizard
 *
 * @description 六页：①基础信息 ②需求对象与用途 ③技术规格与明细 ④数量与预算
 *              ⑤交付与商务 ⑥供应商要求与合规授权。
 *              能力：
 *              · 自动保存草稿（1.5s 防抖；新建时首次有内容即建单）
 *              · 上传 Excel/CSV 产品清单（服务端解析，前端确认后并入明细）
 *              · 上传需求 PDF 提取字段（规则抽取 + 逐项勾选确认后才写入）
 *              提交语义 = 「确认最终版本」（流程第 3 步）：冻结快照+版本+1，
 *              成功后跳授权书签署页（第 4/5 步）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { fetchCommodityTreeChildren, type CommodityTreeOption } from "@/core/api/commodityTree";
import { api } from "@/core/http";
import { FlowStepper } from "./FlowStepper";
import { FileDropzone } from "./FileDropzone";
import {
  createProject,
  extractPdfRequirement,
  fetchProject,
  parseProductListFile,
  patchProject,
  replaceItems,
  submitProject,
  type ExtractedPdf,
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
  usageEnv: string;
  standards: string;
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
  incotermVersion: string;
  paymentTerms: string;
  guarantees: string[];
  batchDelivery: boolean;
  batchNote: string;
  logisticsNote: string;
  manufacturerOnly: boolean;
  supplierQuals: string;
  supplierCountryLimit: string;
  supplierConfirmDate: string;
  contractDate: string;
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
  usageEnv: "",
  standards: "",
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
  incotermVersion: "",
  paymentTerms: "",
  guarantees: [],
  batchDelivery: false,
  batchNote: "",
  logisticsNote: "",
  manufacturerOnly: false,
  supplierQuals: "",
  supplierCountryLimit: "",
  supplierConfirmDate: "",
  contractDate: "",
  quoteDeadlineDate: "",
  complianceFlags: [],
  complianceNote: "",
  authorizePublish: true,
  contactDisclosure: "org_only",
};

const PURPOSE_OPTIONS = ["real", "budgeting", "research", "future_plan"];
const OBJECT_OPTIONS = ["goods", "engineering", "service", "solution"];
const COMPLIANCE_OPTIONS = ["export_control", "dangerous", "medical", "dual_use", "other"];
const INCOTERM_OPTIONS = ["EXW", "FOB", "CIF", "DDP"];
const INSTALL_NEEDS = ["installation", "commissioning", "training"];
const GUARANTEES = ["bid_bond", "performance_bond", "warranty_deposit"];
const CONTACT_DISCLOSURE = ["none", "org_only", "org_contact", "budget_all"];
const ATTACHMENT_KINDS = ["requirement", "tech_doc", "drawing", "bom", "sample", "other"];
const INCOTERM_VERSIONS = ["2020", "2010"];

interface ItemRow {
  lotNo: string;
  nameZh: string;
  spec: string;
  quantity: string;
  qtyUnit: string;
  qtyType: "fixed" | "estimated";
  alternativesAllowed: boolean;
}

const EMPTY_ITEM: ItemRow = { lotNo: "", nameZh: "", spec: "", quantity: "", qtyUnit: "件", qtyType: "fixed", alternativesAllowed: true };

/** PDF 提取字段的勾选键与中文标签（逐项确认面板） */
const PDF_FIELDS: Array<{ key: keyof ExtractedPdf; field: keyof FormState }> = [
  { key: "titleZh", field: "titleZh" },
  { key: "background", field: "background" },
  { key: "usageEnv", field: "usageEnv" },
  { key: "standards", field: "standards" },
  { key: "deliveryCountry", field: "deliveryCountry" },
  { key: "deliveryCity", field: "deliveryCity" },
  { key: "deliveryAddress", field: "deliveryAddress" },
  { key: "quoteDeadlineDate", field: "quoteDeadlineDate" },
  { key: "budgetAmount", field: "budgetAmount" },
  { key: "budgetCurrency", field: "budgetCurrency" },
];

export function ProcurementWizard(props: { editId?: number; onSubmitted?: () => void }) {
  const { t } = useLocale();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [files, setFiles] = useState<File[]>([]);
  const [attachKind, setAttachKind] = useState("requirement");
  const [l1Options, setL1Options] = useState<CommodityTreeOption[]>([]);
  const [l2Options, setL2Options] = useState<CommodityTreeOption[]>([]);
  const [l3Options, setL3Options] = useState<CommodityTreeOption[]>([]);
  const [projectId, setProjectId] = useState<number | null>(props.editId ?? null);
  const [loading, setLoading] = useState(Boolean(props.editId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  /** 保存状态：失败必须可见（旧实现 `catch {}` 静默吞掉，用户在"自动保存"提示下丢光整份内容） */
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  /** 回填失败：禁止提交（否则空白表单提交会整包覆盖原有内容） */
  const [loadFailed, setLoadFailed] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pdfResult, setPdfResult] = useState<ExtractedPdf | null>(null);
  const [pdfSelected, setPdfSelected] = useState<Record<string, boolean>>({});
  const [pdfItemsSelected, setPdfItemsSelected] = useState<boolean[]>([]);

  const projectIdRef = useRef<number | null>(props.editId ?? null);
  const hydratedRef = useRef(!props.editId);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBusy = useRef(false);

  const field = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));
  const setItem = (idx: number, patch: Partial<ItemRow>) =>
    setItems((p) => p.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

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
    setLoadFailed("");
    setLoading(true);
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
          usageEnv: d.usageEnv || "",
          standards: d.standards || "",
          budgetAmount: d.budgetAmount == null ? "" : String(d.budgetAmount),
          budgetCurrency: d.budgetCurrency || "CNY",
          budgetPublic: d.budgetPublic ?? d.budgetAmount != null,
          budgetApproved: d.budgetApproved || "approved",
          deliveryCountry: d.deliveryCountry,
          deliveryCity: d.deliveryCity,
          deliveryAddress: d.deliveryAddress,
          deadlineDate: d.deadlineDate,
          installNeeds: d.installNeeds,
          incoterm: d.incoterm,
          incotermVersion: d.incotermVersion || "",
          paymentTerms: d.paymentTerms,
          guarantees: d.guarantees,
          batchDelivery: Boolean(d.batchDelivery),
          batchNote: d.batchNote || "",
          logisticsNote: d.logisticsNote || "",
          manufacturerOnly: d.manufacturerOnly,
          supplierQuals: d.supplierQuals,
          supplierCountryLimit: d.supplierCountryLimit,
          supplierConfirmDate: d.supplierConfirmDate,
          contractDate: d.contractDate,
          quoteDeadlineDate: d.quoteDeadlineAt ? new Date(d.quoteDeadlineAt * 1000).toISOString().slice(0, 10) : "",
          complianceFlags: d.compliance && Array.isArray(d.compliance.flags) ? (d.compliance.flags as string[]) : [],
          complianceNote: d.compliance && typeof d.compliance.note === "string" ? d.compliance.note : "",
          authorizePublish: true,
          contactDisclosure: d.contactDisclosure || "org_only",
          categoryL3: d.items[0]?.ugtCode ?? d.primaryUgtCode ?? "",
          categoryL2: (d.items[0]?.ugtCode ?? d.primaryUgtCode ?? "").slice(0, 7),
          categoryL1: (d.items[0]?.ugtCode ?? d.primaryUgtCode ?? "").slice(0, 6),
        }));
        // 标包回填：用 lots 的 id ↔ items.lotId 还原 lotNo。
        // 旧实现写死 lotNo:""，把"编辑一次"变成"把整张标包表删空"（persist 以 lotNo 反推 lots）。
        const lotNoById = new Map<number, string>(
          d.lots
            .filter((l): l is { id: number; lotNo: string; title: string; scopeNote: string } => l.id != null)
            .map((l) => [l.id, l.lotNo]),
        );
        setItems(
          d.items.length
            ? d.items.map((it) => ({
                lotNo: it.lotId != null ? lotNoById.get(it.lotId) ?? "" : "",
                nameZh: it.nameZh,
                spec: it.spec,
                quantity: it.quantity == null ? "" : String(it.quantity),
                qtyUnit: it.qtyUnit,
                qtyType: it.qtyType === "estimated" ? "estimated" : "fixed",
                alternativesAllowed: it.alternativesAllowed !== false,
              }))
            : [{ ...EMPTY_ITEM }],
        );
        setLoading(false);
        hydratedRef.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = (err as Error).message || t("pc_load_failed");
        setError(msg);
        setLoadFailed(msg);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.editId, reloadKey, t]);

  const derivedUgt = useMemo(
    () => form.categoryL3 || form.categoryL2 || form.categoryL1 || "",
    [form.categoryL1, form.categoryL2, form.categoryL3],
  );

  const buildPatch = useCallback((): Record<string, unknown> => ({
    titleZh: form.titleZh.trim(),
    titleEn: form.titleEn.trim() || null,
    background: form.background.trim() || null,
    purpose: form.purpose,
    internalProjectNo: form.internalProjectNo.trim() || null,
    objectTypes: form.objectTypes.join(",") || "goods",
    usageEnv: form.usageEnv.trim() || null,
    standards: form.standards.trim() || null,
    budgetAmount: form.budgetAmount === "" ? null : Number(form.budgetAmount),
    budgetCurrency: form.budgetCurrency,
    budgetPublic: form.budgetPublic ? 1 : 0,
    budgetApproved: form.budgetApproved || null,
    deliveryCountry: form.deliveryCountry.trim() || null,
    deliveryCity: form.deliveryCity.trim() || null,
    deliveryAddress: form.deliveryAddress.trim() || null,
    deadlineDate: form.deadlineDate || null,
    installNeeds: form.installNeeds.join(",") || null,
    logisticsNote: form.logisticsNote.trim() || null,
    incoterm: form.incoterm || null,
    incotermVersion: form.incotermVersion || null,
    paymentTerms: form.paymentTerms.trim() || null,
    guarantees: form.guarantees.join(",") || null,
    batchDelivery: form.batchDelivery ? 1 : 0,
    batchNote: form.batchNote.trim() || null,
    supplierCountryLimit: form.supplierCountryLimit.trim() || null,
    manufacturerOnly: form.manufacturerOnly ? 1 : 0,
    supplierQuals: form.supplierQuals.trim() || null,
    quoteDeadlineAt: form.quoteDeadlineDate
      ? Math.floor(new Date(`${form.quoteDeadlineDate}T23:59:59+08:00`).getTime() / 1000)
      : null,
    supplierConfirmDate: form.supplierConfirmDate || null,
    contractDate: form.contractDate || null,
    compliance: JSON.stringify({ flags: form.complianceFlags, note: form.complianceNote.trim() || null }),
    authorizePublish: form.authorizePublish ? 1 : 0,
    contactDisclosure: form.contactDisclosure,
  }), [form]);

  /** 主表 + 明细落库（不含附件；附件只在显式保存/提交时上传） */
  const persist = useCallback(async (pid: number) => {
    await patchProject(pid, buildPatch());
    const filled = items.filter((it) => it.nameZh.trim());
    const lotNos = [...new Set(filled.map((it) => it.lotNo.trim()).filter(Boolean))];
    await replaceItems(
      pid,
      lotNos.map((no) => ({ lotNo: no, title: no })),
      filled.map<ItemDraft>((it) => ({
        lotNo: it.lotNo.trim() || undefined,
        nameZh: it.nameZh.trim(),
        spec: it.spec.trim() || undefined,
        quantity: it.quantity === "" ? undefined : Number(it.quantity),
        qtyUnit: it.qtyUnit || "件",
        qtyType: it.qtyType,
        ugtCode: derivedUgt || undefined,
        alternativesAllowed: it.alternativesAllowed,
      })),
    );
  }, [buildPatch, items, derivedUgt]);

  /**
   * 把"新建草稿的 id"写进 URL（/rfq/{id}/publish），让刷新 / 换设备能续填。
   * 用 history.replaceState 而不是 router.replace：后者会让 Next 重渲染路由、
   * 卸载正在输入的表单（丢焦点、丢未落库的本地状态）。
   */
  const syncUrl = useCallback((pid: number) => {
    if (typeof window === "undefined") return;
    const target = `/rfq/${pid}/publish`;
    if (window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, []);

  // 自动保存：有内容即防抖保存；新建时首次保存顺带建单。失败必须可见（可手动保存重试）。
  useEffect(() => {
    if (loading || submitting) return;
    if (!hydratedRef.current) return;
    const hasContent = form.titleZh.trim().length > 0 || items.some((it) => it.nameZh.trim());
    if (!hasContent) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      void (async () => {
        if (autoBusy.current) return;
        autoBusy.current = true;
        setSaveState("saving");
        try {
          let pid = projectIdRef.current;
          if (!pid) {
            const created = await createProject();
            pid = created.id;
            projectIdRef.current = pid;
            setProjectId(pid);
            // 首次建单立刻绑定 URL：刷新/换设备回来能续填，不再每次都建新空草稿
            syncUrl(pid);
          }
          await persist(pid);
          setLastSavedAt(Date.now());
          setSaveState("saved");
          setSaveError("");
        } catch (err) {
          // 失败不打断输入，但必须可见——尤其"未登记采购主体时建单必然 400"这类，旧实现静默吞掉
          setSaveState("error");
          setSaveError((err as Error).message || t("pc_err_generic"));
        } finally {
          autoBusy.current = false;
        }
      })();
    }, 1500);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [form, items, loading, submitting, persist, syncUrl, t]);

  const validateStep = (index: number): string => {
    if (index === 0 && !form.titleZh.trim()) return t("pc_err_title");
    if (index === 1 && !derivedUgt) return t("pc_err_category");
    if (index === 2 && items.filter((it) => it.nameZh.trim()).length === 0) return t("pc_err_items");
    if (index === 4) {
      if (!form.deliveryCountry.trim() || !form.deliveryCity.trim()) return t("pc_err_delivery");
      if (!form.quoteDeadlineDate) return t("pc_err_deadline");
    }
    if (index === 5 && !form.authorizePublish) return t("pc_err_authorize");
    return "";
  };

  const saveDraft = async (): Promise<number | null> => {
    let pid = projectId;
    if (!pid) {
      const created = await createProject();
      pid = created.id;
      setProjectId(pid);
      projectIdRef.current = pid;
    }
    await persist(pid);
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", attachKind);
      await api(`/api/procurement/projects/${pid}/attachments`, { method: "POST", body: fd });
    }
    return pid;
  };

  const onSubmit = async () => {
    if (loadFailed) return; // 回填失败时禁止提交：空表单提交会整包覆盖原有需求
    for (let i = 0; i < 6; i++) {
      const msg = validateStep(i);
      if (msg) { setStep(i); setError(msg); return; }
    }
    setSubmitting(true);
    setError("");
    try {
      const pid = await saveDraft();
      if (!pid) throw new Error(t("pc_err_generic"));
      await submitProject(pid);
      // 提交后仍停在同一发布页：由状态壳切到"授权书 + 核验进度"，不再跳设置中心
      if (props.onSubmitted) props.onSubmitted();
      else router.replace(`/rfq/${pid}/publish`);
    } catch (err) {
      setError((err as Error).message || t("pc_err_generic"));
      setSubmitting(false);
    }
  };

  const onSaveDraft = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const pid = await saveDraft();
      if (!pid) throw new Error(t("pc_err_generic"));
      setLastSavedAt(Date.now());
      setSaveState("saved");
      setSaveError("");
      setNotice(t("pc_save_draft_ok"));
      // 首次保存后绑定 URL；**不跳走**（填到一半被带到工作台是旧行为）
      syncUrl(pid);
    } catch (err) {
      setError((err as Error).message || t("pc_err_generic"));
      setSaveState("error");
      setSaveError((err as Error).message || t("pc_err_generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const onImportExcel = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError("");
    setImportMsg("");
    try {
      const r = await parseProductListFile(file);
      const rows: ItemRow[] = r.items.map((it) => ({
        lotNo: it.lotNo,
        nameZh: it.nameZh,
        spec: it.spec,
        quantity: it.quantity == null ? "" : String(it.quantity),
        qtyUnit: it.qtyUnit || "件",
        qtyType: "fixed",
        alternativesAllowed: true,
      }));
      setItems((prev) => [...prev.filter((it) => it.nameZh.trim()), ...rows]);
      setImportMsg(`${t("pc_import_done")} ${rows.length}${r.skipped ? ` · ${t("pc_import_skipped")} ${r.skipped}` : ""}`);
    } catch (err) {
      setError((err as Error).message || t("pc_import_failed"));
    } finally {
      setImporting(false);
    }
  };

  const onExtractPdf = async (file: File | null) => {
    if (!file) return;
    setExtracting(true);
    setError("");
    try {
      const r = await extractPdfRequirement(file);
      setPdfResult(r);
      const sel: Record<string, boolean> = {};
      for (const f of PDF_FIELDS) sel[f.key] = Boolean(String(r[f.key] ?? "").trim());
      setPdfSelected(sel);
      setPdfItemsSelected(r.items.map(() => true));
    } catch (err) {
      setError((err as Error).message || t("pc_extract_failed"));
    } finally {
      setExtracting(false);
    }
  };

  const applyPdf = () => {
    if (!pdfResult) return;
    setForm((p) => {
      const next = { ...p };
      for (const f of PDF_FIELDS) {
        if (!pdfSelected[f.key]) continue;
        const value = String(pdfResult[f.key] ?? "").trim();
        if (value) (next[f.field] as string) = value;
      }
      return next;
    });
    const chosen = pdfResult.items.filter((_, i) => pdfItemsSelected[i]);
    if (chosen.length) {
      const rows: ItemRow[] = chosen.map((it) => ({
        lotNo: "",
        nameZh: it.nameZh,
        spec: it.spec,
        quantity: it.quantity == null ? "" : String(it.quantity),
        qtyUnit: it.qtyUnit || "件",
        qtyType: "fixed",
        alternativesAllowed: true,
      }));
      setItems((prev) => [...prev.filter((it) => it.nameZh.trim()), ...rows]);
    }
    setPdfResult(null);
  };

  if (loading) return <div className="py-10 text-center text-sm text-secondary-400">{t("pc_loading")}</div>;

  // 回填失败必须是页面级错误态并禁止提交：旧实现只把错误塞在底部红字里，
  // 用户看到的是一张空白可编辑表单，提交即整包覆盖原有需求（丢明细/预算/条款）。
  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-secondary-700">{t("pc_load_failed")}</p>
        <p className="mt-1 break-all text-xs text-secondary-400">{loadFailed}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          {t("pc_retry")}
        </button>
      </div>
    );
  }

  const STEPS = [t("pc_step1"), t("pc_step2"), t("pc_step3"), t("pc_step4"), t("pc_step5"), t("pc_step6")];
  const inputCls = "mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm";
  const labelCls = "text-sm font-semibold text-secondary-700";

  return (
    <div ref={rootRef} className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="mb-3 rounded-xl border border-secondary-100 bg-secondary-50/60 px-3 py-2">
        <FlowStepper current={2} compact />
      </div>

      {/* 顶部工具条：自动保存状态（三态）+ PDF 提取 + 草稿保存 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-secondary-500">
        <span className={saveState === "error" ? "font-semibold text-red-600" : undefined}>
          {saveState === "saving"
            ? t("pc_autosave_saving")
            : saveState === "error"
              ? t("pc_autosave_error")
              : lastSavedAt
                ? `${t("pc_autosave_saved")} ${new Date(lastSavedAt).toLocaleTimeString()}`
                : t("pc_autosave_hint")}
        </span>
        <div className="flex items-center gap-2">
          {saveState === "error" && saveError && (
            <span className="max-w-[260px] truncate text-red-600" title={saveError}>{saveError}</span>
          )}
          {notice && <span className="text-teal-700">{notice}</span>}
          <label className="cursor-pointer rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600 hover:bg-secondary-50">
            {extracting ? "…" : t("pc_extract_pdf")}
            <input type="file" accept=".pdf" className="hidden" onChange={(e) => { void onExtractPdf(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <button type="button" disabled={submitting} onClick={onSaveDraft} className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600 disabled:opacity-50">
            {t("pc_save_draft")}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => { const msg = validateStep(step); if (msg && i > step) { setError(msg); return; } setError(""); setStep(i); }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${step === i ? "bg-teal-600 text-white" : "bg-secondary-100 text-secondary-600"}`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-4">
          <label className={labelCls}>
            {t("pc_titleZh")} *
            <input value={form.titleZh} onChange={(e) => field("titleZh", e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("pc_titleEn")}
            <input value={form.titleEn} onChange={(e) => field("titleEn", e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("pc_background")}
            <textarea value={form.background} onChange={(e) => field("background", e.target.value)} rows={4} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              {t("pc_purpose")} *
              <select value={form.purpose} onChange={(e) => field("purpose", e.target.value)} className={inputCls}>
                {PURPOSE_OPTIONS.map((p) => <option key={p} value={p}>{t(`pc_purpose_${p}`)}</option>)}
              </select>
            </label>
            <label className={labelCls}>
              {t("pc_internalNo")}
              <input value={form.internalProjectNo} onChange={(e) => field("internalProjectNo", e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className={labelCls}>
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
          <label className={labelCls}>
            {t("pc_usageEnv")}
            <textarea value={form.usageEnv} onChange={(e) => field("usageEnv", e.target.value)} rows={2} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("pc_standards")}
            <textarea value={form.standards} onChange={(e) => field("standards", e.target.value)} rows={2} className={inputCls} />
          </label>
          <div className={labelCls}>
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
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={labelCls}>{t("pc_items")} *</div>
            <label className="cursor-pointer rounded-lg border border-dashed border-secondary-300 px-3 py-1.5 text-xs font-semibold text-secondary-600 hover:bg-secondary-50">
              {importing ? "…" : t("pc_import_excel")}
              <input type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => { void onImportExcel(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
          </div>
          {importMsg && <div className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">{importMsg}</div>}
          <div className="grid gap-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid gap-2 rounded-lg border border-secondary-200 p-3 sm:grid-cols-[2fr_3fr_auto_auto_auto]">
                <input placeholder={t("pc_item_name")} value={it.nameZh} onChange={(e) => setItem(idx, { nameZh: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                <input placeholder={t("pc_item_spec")} value={it.spec} onChange={(e) => setItem(idx, { spec: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                <label className="flex items-center gap-1 text-xs text-secondary-600">
                  <input type="checkbox" checked={it.alternativesAllowed} onChange={(e) => setItem(idx, { alternativesAllowed: e.target.checked })} />
                  {t("pc_item_alt")}
                </label>
                <button type="button" onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))} className="rounded-lg border border-secondary-300 px-2 text-xs text-secondary-500">✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setItems((p) => [...p, { ...EMPTY_ITEM }])} className="rounded-lg border border-dashed border-secondary-300 px-3 py-2 text-xs text-secondary-500">
            + {t("pc_item_add")}
          </button>

          <div className={labelCls}>
            {t("pc_attachments")}
            <div className="mt-1">
              <select value={attachKind} onChange={(e) => setAttachKind(e.target.value)} className="mb-2 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm sm:w-64">
                {ATTACHMENT_KINDS.map((k) => <option key={k} value={k}>{t(`pc_attach_${k}`)}</option>)}
              </select>
              <FileDropzone
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip"
                maxSizeBytes={20 * 1024 * 1024}
                multiple
                files={files}
                onFilesChange={setFiles}
                onReject={(r) => setError(r === "size" ? t("pc_fz_err_size") : t("pc_fz_err_type"))}
              />
              <p className="mt-1 text-xs text-secondary-400">{t("pc_attachments_hint")}</p>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <div className={labelCls}>
            {t("pc_items")}
            <div className="mt-1 grid gap-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border border-secondary-200 p-3 sm:grid-cols-[1fr_2fr_1fr_1fr_1fr]">
                  <input placeholder={t("pc_item_lot")} value={it.lotNo} onChange={(e) => setItem(idx, { lotNo: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <div className="truncate text-sm text-secondary-600">{it.nameZh || "—"}</div>
                  <input placeholder={t("pc_item_qty")} value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <input placeholder={t("pc_item_unit")} value={it.qtyUnit} onChange={(e) => setItem(idx, { qtyUnit: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <select value={it.qtyType} onChange={(e) => setItem(idx, { qtyType: e.target.value as ItemRow["qtyType"] })} className="rounded-lg border border-secondary-300 px-2 py-2 text-sm">
                    <option value="fixed">{t("pc_qty_fixed")}</option>
                    <option value="estimated">{t("pc_qty_estimated")}</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelCls}>
              {t("pc_budget")}
              <input value={form.budgetAmount} onChange={(e) => field("budgetAmount", e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("pc_currency")}
              <select value={form.budgetCurrency} onChange={(e) => field("budgetCurrency", e.target.value)} className={inputCls}>
                {["CNY", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className={labelCls}>
              {t("pc_budgetApproved")}
              <select value={form.budgetApproved} onChange={(e) => field("budgetApproved", e.target.value)} className={inputCls}>
                {["approved", "partial", "pending", "applying"].map((v) => <option key={v} value={v}>{t(`pc_budget_${v}`)}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-secondary-700">
            <input type="checkbox" checked={form.budgetPublic} onChange={(e) => field("budgetPublic", e.target.checked)} />
            {t("pc_budgetPublic")}
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelCls}>
              {t("pc_deliveryCountry")} *
              <input value={form.deliveryCountry} onChange={(e) => field("deliveryCountry", e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("pc_deliveryCity")} *
              <input value={form.deliveryCity} onChange={(e) => field("deliveryCity", e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("pc_deadlineDate")}
              <input type="date" value={form.deadlineDate} onChange={(e) => field("deadlineDate", e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            {t("pc_deliveryAddress")}
            <input value={form.deliveryAddress} onChange={(e) => field("deliveryAddress", e.target.value)} className={inputCls} />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-sm text-secondary-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.batchDelivery} onChange={(e) => field("batchDelivery", e.target.checked)} />
              {t("pc_batchDelivery")}
            </label>
            <input value={form.batchNote} onChange={(e) => field("batchNote", e.target.value)} placeholder={t("pc_batchNote")} className="min-w-64 flex-1 rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelCls}>
              {t("pc_incoterm")}
              <select value={form.incoterm} onChange={(e) => field("incoterm", e.target.value)} className={inputCls}>
                <option value="">--</option>
                {INCOTERM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className={labelCls}>
              {t("pc_incotermVersion")}
              <select value={form.incotermVersion} onChange={(e) => field("incotermVersion", e.target.value)} className={inputCls}>
                <option value="">--</option>
                {INCOTERM_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className={labelCls}>
              {t("pc_quoteDeadline")} *
              <input type="date" value={form.quoteDeadlineDate} onChange={(e) => field("quoteDeadlineDate", e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            {t("pc_paymentTerms")}
            <textarea value={form.paymentTerms} onChange={(e) => field("paymentTerms", e.target.value)} rows={2} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("pc_logisticsNote")}
            <textarea value={form.logisticsNote} onChange={(e) => field("logisticsNote", e.target.value)} rows={2} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={labelCls}>
              {t("pc_installNeeds")}
              <div className="mt-1 flex flex-wrap gap-2">
                {INSTALL_NEEDS.map((o) => (
                  <button key={o} type="button" onClick={() => field("installNeeds", toggle(form.installNeeds, o))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.installNeeds.includes(o) ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                    {t(`pc_install_${o}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className={labelCls}>
              {t("pc_guarantees")}
              <div className="mt-1 flex flex-wrap gap-2">
                {GUARANTEES.map((o) => (
                  <button key={o} type="button" onClick={() => field("guarantees", toggle(form.guarantees, o))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.guarantees.includes(o) ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                    {t(`pc_guar_${o}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-4">
          <div className="border-b border-secondary-100 pb-1 text-sm font-bold text-secondary-700">{t("pc_supplierReqs")}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              {t("pc_supplierCountryLimit")}
              <input value={form.supplierCountryLimit} onChange={(e) => field("supplierCountryLimit", e.target.value)} className={inputCls} />
            </label>
            <label className="flex items-center gap-2 self-end text-sm text-secondary-700">
              <input type="checkbox" checked={form.manufacturerOnly} onChange={(e) => field("manufacturerOnly", e.target.checked)} />
              {t("pc_manufacturerOnly")}
            </label>
          </div>
          <label className={labelCls}>
            {t("pc_supplierQuals")}
            <textarea value={form.supplierQuals} onChange={(e) => field("supplierQuals", e.target.value)} rows={2} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              {t("pc_supplierConfirmDate")}
              <input type="date" value={form.supplierConfirmDate} onChange={(e) => field("supplierConfirmDate", e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("pc_contractDate")}
              <input type="date" value={form.contractDate} onChange={(e) => field("contractDate", e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            {t("pc_contactDisclosure")}
            <select value={form.contactDisclosure} onChange={(e) => field("contactDisclosure", e.target.value)} className={inputCls}>
              {CONTACT_DISCLOSURE.map((v) => <option key={v} value={v}>{t(`pc_disc_${v}`)}</option>)}
            </select>
          </label>
          <div className={labelCls}>
            {t("pc_compliance")}
            <div className="mt-1 flex flex-wrap gap-2">
              {COMPLIANCE_OPTIONS.map((o) => (
                <button key={o} type="button" onClick={() => field("complianceFlags", toggle(form.complianceFlags, o))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.complianceFlags.includes(o) ? "border-amber-500 bg-amber-50 text-amber-700" : "border-secondary-300 text-secondary-600"}`}>
                  {t(`pc_comp_${o}`)}
                </button>
              ))}
            </div>
            <input value={form.complianceNote} onChange={(e) => field("complianceNote", e.target.value)} placeholder={t("pc_complianceNote")} className="mt-2 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-secondary-700">
            <input type="checkbox" checked={form.authorizePublish} onChange={(e) => field("authorizePublish", e.target.checked)} />
            {t("pc_authorizePublish")} *
          </label>
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
            <div className="text-sm font-bold text-teal-800">{t("pc_auth_hint_title")}</div>
            <p className="mt-1 text-xs leading-relaxed text-teal-700">{t("pc_auth_hint_body")}</p>
            <p className="mt-1 text-xs text-teal-600">{t("pc_auth_hint_warning")}</p>
          </div>
        </div>
      )}

      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {/* PDF 提取结果：逐项确认后才写入 */}
      {pdfResult && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-blue-900">{t("pc_extract_title")}</div>
            <div className="text-xs text-blue-700">{t("pc_extract_textlen")} {pdfResult.textLength}</div>
          </div>
          <p className="mt-1 text-xs text-blue-700">{t("pc_extract_hint")}</p>
          <div className="mt-3 grid gap-2">
            {PDF_FIELDS.filter((f) => String(pdfResult[f.key] ?? "").trim()).map((f) => (
              <label key={f.key} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-secondary-700">
                <input type="checkbox" checked={Boolean(pdfSelected[f.key])} onChange={(e) => setPdfSelected((p) => ({ ...p, [f.key]: e.target.checked }))} className="mt-0.5" />
                <span className="flex-1">
                  <span className="font-semibold">{t(`pc_field_${f.field}`)}</span>：{String(pdfResult[f.key])}
                  {pdfResult.sources[f.key] && <span className="mt-0.5 block text-secondary-400">{pdfResult.sources[f.key]}</span>}
                </span>
              </label>
            ))}
            {pdfResult.items.map((it, i) => (
              <label key={i} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-secondary-700">
                <input type="checkbox" checked={pdfItemsSelected[i] ?? false} onChange={(e) => setPdfItemsSelected((p) => p.map((v, idx) => (idx === i ? e.target.checked : v)))} className="mt-0.5" />
                <span className="flex-1">
                  <span className="font-semibold">{t("pc_extract_item")}</span>：{it.nameZh}
                  {it.spec ? `（${it.spec}）` : ""} × {it.quantity ?? "-"} {it.qtyUnit}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={applyPdf} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">{t("pc_extract_apply")}</button>
            <button type="button" onClick={() => setPdfResult(null)} className="rounded-lg border border-secondary-300 px-4 py-2 text-xs font-semibold text-secondary-600">{t("pc_cancel")}</button>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <div className="text-xs text-secondary-400">{t("pc_bpage_hint")}</div>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => { setError(""); setStep((s) => s - 1); }} className="rounded-lg border border-secondary-300 px-4 py-2 text-sm font-semibold text-secondary-600">
              {t("pc_prev")}
            </button>
          )}
          {step < 5 ? (
            <button type="button" onClick={() => { const m = validateStep(step); if (m) { setError(m); return; } setError(""); setStep((s) => s + 1); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              {t("pc_next")}
            </button>
          ) : (
            <button type="button" disabled={submitting || !!loadFailed} onClick={onSubmit} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? t("pc_submitting") : t("pc_submit_confirm")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
