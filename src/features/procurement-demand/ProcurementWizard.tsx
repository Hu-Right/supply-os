"use client";
import { FieldHintTooltip, SearchableSelect, Select } from "@/shared/ui";

/**
 * 采购需求发布向导（全案 F02 六页结构）
 * @module features/procurement-demand/ProcurementWizard
 *
 * @description 六页：①基础信息 ②需求对象与用途 ③技术规格与明细 ④数量与预算
 *              ⑤交付与商务 ⑥供应商要求与合规授权。
 *              能力：
 *              · 自动保存草稿（1.5s 防抖；新建时首次有内容即建单）
 *              · 上传 Excel 产品清单（服务端解析，前端确认后并入明细）
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
import { CertRequirementsEditor } from "./CertRequirementsEditor";
import { GuaranteeEditor } from "./GuaranteeEditor";
import {
  guaranteeTypes,
  parseGuarantees,
  type GuaranteeRequirement,
} from "@/shared/constants/guarantees";
import {
  parseCertRequirements,
  type CertRequirement,
} from "@/shared/constants/procurement-cert-requirements";
import {
  PROCUREMENT_CURRENCIES,
  parseBudgetAmount,
} from "@/shared/constants/procurement-currencies";
import {
  countryName,
  countryOptions,
  guessCountryCode,
} from "@/shared/constants/countries";
import {
  INCOTERM_VERSIONS,
  incotermsForVersion,
  migrateIncoterm,
} from "@/shared/constants/incoterms";
import {
  AWARD_METHOD_BY_METHOD,
  EVAL_TEMPLATE_PRESET_70_30,
  PROCUREMENT_METHOD_AVAILABLE,
  SEALED_BY_METHOD,
} from "@/shared/constants/procurement";
import {
  recommendMethodV2,
  type MethodAdvisorCycle,
  type MethodAdvisorEvalMode,
  type MethodSpecClarity,
} from "@/shared/utils/procurement-method";
import {
  createProject,
  fetchProject,
  parseProductListFile,
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
  /** 采购方式（P0 仅 rfq 开放；服务端按 PROCUREMENT_METHOD_AVAILABLE 校验） */
  method: string;
  usageEnv: string;
  certRequirements: CertRequirement[];
  categoryL1: string;
  categoryL2: string;
  categoryL3: string;
  budgetAmount: string;
  budgetCurrency: string;
  budgetPublic: boolean;
  deliveryCountry: string;
  deliveryCity: string;
  deliveryAddress: string;
  deadlineDate: string;
  installNeeds: string[];
  incoterm: string;
  incotermPlace: string;
  incotermVersion: string;
  paymentTerms: string;
  guarantees: GuaranteeRequirement[];
  batchDelivery: boolean;
  batchNote: string;
  logisticsNote: string;
  supplierType: string;
  supplierQuals: string;
  supplierConfirmDate: string;
  contractDate: string;
  quoteDeadlineDate: string;
  complianceFlags: string[];
  complianceNote: string;
  authorizePublish: boolean;
  contactDisclosure: string;
  fundingSource: string;
  contractingMode: string;
  qtyTolerance: string;
}

const DEFAULT_FORM: FormState = {
  titleZh: "",
  titleEn: "",
  background: "",
  purpose: "real",
  internalProjectNo: "",
  objectTypes: ["goods"],
  method: "rfq",
  usageEnv: "",
  certRequirements: [],
  categoryL1: "",
  categoryL2: "",
  categoryL3: "",
  budgetAmount: "",
  budgetCurrency: "CNY",
  budgetPublic: false,
  deliveryCountry: "",
  deliveryCity: "",
  deliveryAddress: "",
  deadlineDate: "",
  installNeeds: [],
  incoterm: "",
  incotermPlace: "",
  incotermVersion: "2020",
  paymentTerms: "",
  guarantees: [],
  batchDelivery: false,
  batchNote: "",
  logisticsNote: "",
  supplierType: "any",
  supplierQuals: "",
  supplierConfirmDate: "",
  contractDate: "",
  quoteDeadlineDate: "",
  complianceFlags: [],
  complianceNote: "",
  authorizePublish: true,
  contactDisclosure: "org_only",
  fundingSource: "",
  contractingMode: "",
  qtyTolerance: "",
};

const PURPOSE_OPTIONS = ["real", "budgeting", "research", "future_plan"];
const OBJECT_OPTIONS = ["goods", "engineering", "service", "solution"];
/** 采购方式选项（P0 仅 rfq 可选，其余禁用展示；可用集 = PROCUREMENT_METHOD_AVAILABLE） */
const METHOD_OPTIONS = ["rfq", "itb", "rfp", "eoi", "lta"] as const;
const COMPLIANCE_OPTIONS = ["export_control", "dangerous", "medical", "dual_use", "other"];
const INSTALL_NEEDS = ["installation", "commissioning", "training"];
const CONTACT_DISCLOSURE = ["none", "org_only", "budget_all"];
const ATTACHMENT_KINDS = ["requirement", "tech_doc", "drawing", "bom", "sample", "other"];

/** 付款方式快捷预设：点一下填入，仍可在文本框里改比例/账期 */
const PAYMENT_PRESET_KEYS = [
  "pc_pay_100",
  "pc_pay_30_70",
  "pc_pay_50_50",
  "pc_pay_delivery",
  "pc_pay_net30",
  "pc_pay_net60",
  "pc_pay_lc",
  "pc_pay_milestone",
] as const;

interface ItemRow {
  lotNo: string;
  nameZh: string;
  spec: string;
  quantity: string;
  qtyUnit: string;
  alternativesAllowed: boolean;
}

const EMPTY_ITEM: ItemRow = { lotNo: "", nameZh: "", spec: "", quantity: "", qtyUnit: "件", alternativesAllowed: true };

export function ProcurementWizard(props: { editId?: number; onSubmitted?: () => void }) {
  const { t, locale } = useLocale();
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
  /** 三问引导（Q2 评定标口径 / Q3 供货周期）——随自动保存落 method_decisions；Q1 复用 objectTypes */
  const [advisorEval, setAdvisorEval] = useState<MethodAdvisorEvalMode>("lowest");
  const [advisorCycle, setAdvisorCycle] = useState<MethodAdvisorCycle>("once");
  /** 七维高级判定（可折叠；P1a 暴露规格明确性/先征集/强制程序三维，其余由派生与预算字段承载） */
  const [advisorAdvanced, setAdvisorAdvanced] = useState(false);
  const [advisorSpec, setAdvisorSpec] = useState<MethodSpecClarity>("clear");
  const [advisorPre, setAdvisorPre] = useState(false);
  const [advisorRule, setAdvisorRule] = useState("");
  /** 偏离系统推荐方式时的理由（method_decisions.buyer_note） */
  const [decisionNote, setDecisionNote] = useState("");
  /** 采购规则：发布模式（prequalified 属短名单后续项目，向导不直选） */
  const [publishMode, setPublishMode] = useState("public");
  /** 采购规则：ITB 答疑截止（日期，存东八区 23:59:59；须早于截标） */
  const [qaDeadlineDate, setQaDeadlineDate] = useState("");

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
          method: d.method || "rfq",
          usageEnv: d.usageEnv || "",
          certRequirements: parseCertRequirements(d.certRequirements),
          budgetAmount: d.budgetAmount == null ? "" : String(d.budgetAmount),
          budgetCurrency: d.budgetCurrency || "CNY",
          budgetPublic: d.budgetPublic ?? d.budgetAmount != null,
          deliveryCountry: d.deliveryCountryCode || guessCountryCode(d.deliveryCountry) || "",
          deliveryCity: d.deliveryCity,
          deliveryAddress: d.deliveryAddress,
          deadlineDate: d.deadlineDate,
          installNeeds: d.installNeeds,
          incoterm: d.incoterm,
          incotermPlace: d.incotermPlace || "",
          incotermVersion: d.incotermVersion || "2020",
          paymentTerms: d.paymentTerms,
          guarantees: parseGuarantees(d.guaranteeConfig, d.guarantees),
          batchDelivery: Boolean(d.batchDelivery),
          batchNote: d.batchNote || "",
          logisticsNote: d.logisticsNote || "",
          fundingSource: d.fundingSource || "",
          contractingMode: d.contractingMode || "",
          qtyTolerance: d.qtyTolerance || "",
          supplierType: d.supplierType || "any",
          supplierQuals: d.supplierQuals,
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

  /** 七维判定 → 推荐（随填报动态重算；用户可改，偏离须留理由） */
  const recommendation = useMemo(
    () =>
      recommendMethodV2({
        objectTypes: form.objectTypes,
        specClarity: advisorSpec,
        solutionComparison: advisorEval === "scored",
        recurring: advisorCycle === "recurring",
        preSourcing: advisorEval === "intent" || advisorPre,
        budgetKnown: form.budgetAmount.trim() !== "",
        mandatoryRuleMethod: advisorRule.trim() || null,
      }),
    [form.objectTypes, form.budgetAmount, advisorSpec, advisorEval, advisorCycle, advisorPre, advisorRule],
  );
  const recommendedMethod = recommendation.method;
  /** 判定输入快照（自动保存时随存随落 method_decisions） */
  const advisorInputs = useMemo(
    () => ({
      objectTypes: form.objectTypes,
      specClarity: advisorSpec,
      solutionComparison: advisorEval === "scored",
      recurring: advisorCycle === "recurring",
      preSourcing: advisorEval === "intent" || advisorPre,
      budgetKnown: form.budgetAmount.trim() !== "",
      mandatoryRuleMethod: advisorRule.trim() || null,
    }),
    [form.objectTypes, form.budgetAmount, advisorSpec, advisorEval, advisorCycle, advisorPre, advisorRule],
  );

  const countrySelectOptions = useMemo(
    () => countryOptions(locale).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` })),
    [locale],
  );

  const buildPatch = useCallback((): Record<string, unknown> => ({
    titleZh: form.titleZh.trim(),
    titleEn: form.titleEn.trim() || null,
    background: form.background.trim() || null,
    purpose: form.purpose,
    internalProjectNo: form.internalProjectNo.trim() || null,
    objectTypes: form.objectTypes.join(",") || "goods",
    method: form.method,
    usageEnv: form.usageEnv.trim() || null,
    certRequirements: form.certRequirements,
    budgetAmount: parseBudgetAmount(form.budgetAmount),
    budgetCurrency: form.budgetCurrency,
    budgetPublic: form.budgetPublic ? 1 : 0,
    deliveryCountry: form.deliveryCountry ? countryName(form.deliveryCountry, locale) : null,
    deliveryCountryCode: form.deliveryCountry || null,
    deliveryCity: form.deliveryCity.trim() || null,
    deliveryAddress: form.deliveryAddress.trim() || null,
    deadlineDate: form.deadlineDate || null,
    installNeeds: form.installNeeds.join(",") || null,
    logisticsNote: form.logisticsNote.trim() || null,
    incoterm: form.incoterm || null,
    incotermPlace: form.incoterm ? form.incotermPlace.trim() || null : null,
    incotermVersion: form.incoterm ? form.incotermVersion || "2020" : null,
    paymentTerms: form.paymentTerms.trim() || null,
    guarantees: guaranteeTypes(form.guarantees) || null,
    guaranteeConfig: form.guarantees,
    batchDelivery: form.batchDelivery ? 1 : 0,
    batchNote: form.batchNote.trim() || null,
    fundingSource: form.fundingSource || null,
    contractingMode: form.contractingMode || null,
    qtyTolerance: form.qtyTolerance.trim() || null,
    supplierQuals: form.supplierQuals.trim() || null,
    supplierType: form.supplierType,
    quoteDeadlineAt: form.quoteDeadlineDate
      ? Math.floor(new Date(`${form.quoteDeadlineDate}T23:59:59+08:00`).getTime() / 1000)
      : null,
    supplierConfirmDate: form.supplierConfirmDate || null,
    contractDate: form.contractDate || null,
    compliance: JSON.stringify({ flags: form.complianceFlags, note: form.complianceNote.trim() || null }),
    authorizePublish: form.authorizePublish ? 1 : 0,
    contactDisclosure: form.contactDisclosure,
  }), [form, locale]);

  /** 主表 + 明细落库（不含附件；附件只在显式保存/提交时上传） */
  const persist = useCallback(async (pid: number) => {
    await patchProject(pid, buildPatch());
    // 方式判定与采购规则随存随落（fire-and-forget：失败不阻断草稿保存，
    // 提交时会合成 passthrough 判定兜底；偏离推荐未填理由时判定暂缓、UI 有提示）
    void api(`/api/procurement/projects/${pid}/method-decision`, {
      method: "POST",
      body: {
        buyerMethod: form.method,
        buyerNote: form.method !== recommendedMethod ? decisionNote.trim() || null : null,
        inputs: advisorInputs,
      },
    }).catch(() => undefined);
    void api(`/api/procurement/projects/${pid}/tender-config`, {
      method: "PUT",
      body: {
        publishMode,
        ...(form.method === "rfp" ? { evalTemplate: EVAL_TEMPLATE_PRESET_70_30 } : {}),
        ...(form.method === "itb" && qaDeadlineDate
          ? { qaDeadlineAt: Math.floor(new Date(`${qaDeadlineDate}T23:59:59+08:00`).getTime() / 1000) }
          : {}),
      },
    }).catch(() => undefined);
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
        ugtCode: derivedUgt || undefined,
        alternativesAllowed: it.alternativesAllowed,
      })),
    );
  }, [buildPatch, items, derivedUgt, form.method, recommendedMethod, decisionNote, advisorInputs, publishMode, qaDeadlineDate]);

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
    if (index === 2 && form.certRequirements.some((r) => !r.name.trim())) return t("pc_err_cert_custom");
    if (index === 3 && form.budgetAmount.trim() && parseBudgetAmount(form.budgetAmount) === null) {
      return t("pc_err_budget");
    }
    if (index === 4) {
      if (!form.deliveryCountry.trim() || !form.deliveryCity.trim()) return t("pc_err_delivery");
      if (!form.quoteDeadlineDate) return t("pc_err_deadline");
      if (form.incoterm && !form.incotermVersion) return t("pc_err_incoterm_version");
      if (form.incoterm && !form.incotermPlace.trim()) return t("pc_err_incoterm_place");
      for (const guarantee of form.guarantees) {
        if (guarantee.type === "other" && !guarantee.otherName.trim()) return t("pc_err_guarantee_other");
        if (guarantee.value != null) {
          if (guarantee.value <= 0) return t("pc_err_guarantee_value");
          if (guarantee.basis === "percent" && guarantee.value > 100) return t("pc_err_guarantee_value");
        }
      }
    }
    if (index === 5 && !form.authorizePublish) return t("pc_err_authorize");
    if (index === 5 && form.complianceFlags.includes("other") && !form.complianceNote.trim()) {
      return t("pc_err_compliance_note");
    }
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

      {/* 顶部工具条：自动保存状态（三态）+ 草稿保存 */}
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
              <Select value={form.purpose} onChange={(e) => field("purpose", e.target.value)} className={inputCls}>
                {PURPOSE_OPTIONS.map((p) => <option key={p} value={p}>{t(`pc_purpose_${p}`)}</option>)}
              </Select>
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
          {/* 采购方式：判定引导（Q1 标的形态复用上方「采购标的」）+ 方式选择器 + 采购规则。
              区分口径不要求采购方背术语——按七维判定推荐（F08），用户可改、偏离须留理由。 */}
          <div className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_method")}
              <FieldHintTooltip label={t("pc_method")} content={t("pc_method_hint")} />
            </span>
            <div className="mt-1 grid gap-2 rounded-xl border border-secondary-200 bg-secondary-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-secondary-600">{t("pc_advisor_eval")}</span>
                {(["lowest", "scored", "intent"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setAdvisorEval(m)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${advisorEval === m ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                    {t(`pc_advisor_eval_${m}`)}
                  </button>
                ))}
                <span className="ml-2 font-semibold text-secondary-600">{t("pc_advisor_cycle")}</span>
                {(["once", "recurring"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setAdvisorCycle(c)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${advisorCycle === c ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                    {t(`pc_advisor_cycle_${c}`)}
                  </button>
                ))}
                <button type="button" onClick={() => setAdvisorAdvanced(!advisorAdvanced)}
                  className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-secondary-500 underline decoration-dotted">
                  {t("pc_advisor_toggle")}
                </button>
              </div>
              {advisorAdvanced && (
                <div className="grid gap-2 rounded-lg border border-secondary-200 bg-white p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-secondary-600">{t("pc_advisor_spec")}</span>
                    {(["clear", "partial", "unclear"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setAdvisorSpec(s)}
                        className={`rounded-lg border px-2.5 py-1 font-semibold ${advisorSpec === s ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                        {t(`pc_advisor_spec_${s}`)}
                      </button>
                    ))}
                    <span className="ml-2 font-semibold text-secondary-600">{t("pc_advisor_pre")}</span>
                    {(["no", "yes"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setAdvisorPre(v === "yes")}
                        className={`rounded-lg border px-2.5 py-1 font-semibold ${advisorPre === (v === "yes") ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                        {v === "yes" ? t("pc_yes") : t("pc_no")}
                      </button>
                    ))}
                  </div>
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-secondary-600">{t("pc_advisor_rule")}</span>
                    <input value={advisorRule} onChange={(e) => setAdvisorRule(e.target.value)}
                      placeholder={t("pc_advisor_rule_ph")}
                      className="min-w-[200px] flex-1 rounded-lg border border-secondary-300 px-2.5 py-1" />
                  </label>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-700">
                  {t("pc_method_recommended")}：{t(`pc_method_${recommendedMethod}`)}
                </span>
                {recommendation.reasonKeys.slice(0, 2).map((k) => (
                  <span key={k} className="text-secondary-500">{t(k)}</span>
                ))}
                {recommendedMethod !== form.method && (
                  PROCUREMENT_METHOD_AVAILABLE.includes(recommendedMethod) ? (
                    <button type="button" onClick={() => field("method", recommendedMethod)}
                      className="rounded-lg border border-teal-600 px-2.5 py-1 font-semibold text-teal-700">
                      {t("pc_method_adopt")}
                    </button>
                  ) : (
                    <span className="text-secondary-500">{t("pc_method_unavailable")}</span>
                  )
                )}
              </div>
              {recommendation.missingKeys.length > 0 && (
                <div className="text-xs text-amber-700">
                  {t("pc_method_missing_prefix")}
                  {recommendation.missingKeys.map((k) => t(k)).join("；")}
                </div>
              )}
              {PROCUREMENT_METHOD_AVAILABLE.includes(form.method) && form.method !== recommendedMethod && (
                <label className="grid gap-1 text-xs">
                  <span className="font-semibold text-secondary-600">{t("pc_advisor_note")}</span>
                  <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder={t("pc_advisor_note_ph")}
                    className="rounded-lg border border-secondary-300 px-2.5 py-1.5" />
                </label>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {METHOD_OPTIONS.map((m) => {
                const available = PROCUREMENT_METHOD_AVAILABLE.includes(m);
                return (
                  <button key={m} type="button" disabled={!available} onClick={() => field("method", m)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.method === m ? "border-teal-600 bg-teal-50 text-teal-700" : available ? "border-secondary-300 text-secondary-600" : "cursor-not-allowed border-secondary-200 text-secondary-400 opacity-60"}`}>
                    {t(`pc_method_${m}`)}
                    {!available && <span className="ml-1 text-[10px] font-normal">{t("pc_method_coming_soon")}</span>}
                  </button>
                );
              })}
            </div>
            {/* 采购规则确认区（§4.5）：发布模式可选；密封/评标法按方式派生只读展示。
                发布时消费该配置并冻结，rfq 无覆盖 = P0 行为。 */}
            <div className="mt-2 grid gap-2 rounded-xl border border-secondary-200 bg-secondary-50/60 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-secondary-600">{t("pc_rules")}</span>
                <FieldHintTooltip label={t("pc_rules")} content={t("pc_rules_hint")} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-secondary-600">{t("pc_rule_publish_mode")}</span>
                {(["public", "targeted"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPublishMode(p)}
                    className={`rounded-lg border px-2.5 py-1 font-semibold ${publishMode === p ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                    {t(`pc_publish_${p}`)}
                  </button>
                ))}
                {form.method === "itb" && (
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="text-secondary-600">{t("pc_rule_qa_deadline")}</span>
                    <input type="date" value={qaDeadlineDate} onChange={(e) => setQaDeadlineDate(e.target.value)}
                      className="rounded-lg border border-secondary-300 px-2 py-1" />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-secondary-500">
                <span>{t("pc_rule_sealed")}：{SEALED_BY_METHOD[form.method] === false ? t("pc_no") : t("pc_yes")}</span>
                <span>{t("pc_rule_award")}：{t(`pc_award_${AWARD_METHOD_BY_METHOD[form.method] ?? "lowest_price"}`)}</span>
                {form.method === "rfp" && <span>{t("pc_rule_eval_preset")}</span>}
                {form.method === "rfp" && <span>{t("pc_rule_envelope_split")}</span>}
                {form.method === "itb" && <span>{t("pc_rule_doc_package")}</span>}
              </div>
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

          <CertRequirementsEditor
            value={form.certRequirements}
            onChange={(next) => field("certRequirements", next)}
          />
          <div className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_category")} *
              <FieldHintTooltip label={t("pc_category")} content={t("pc_category_hint")} />
            </span>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <Select value={form.categoryL1} onChange={(e) => { field("categoryL1", e.target.value); field("categoryL2", ""); field("categoryL3", ""); }} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm">
                <option value="">{t("pc_category_l1")}</option>
                {l1Options.map((o) => <option key={o.key} value={o.key}>{o.nameZh}</option>)}
              </Select>
              <Select value={form.categoryL2} onChange={(e) => { field("categoryL2", e.target.value); field("categoryL3", ""); }} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" disabled={!form.categoryL1}>
                <option value="">{t("pc_category_l2")}</option>
                {l2Options.map((o) => <option key={o.key} value={o.key}>{o.nameZh}</option>)}
              </Select>
              <Select value={form.categoryL3} onChange={(e) => field("categoryL3", e.target.value)} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" disabled={!form.categoryL2}>
                <option value="">{t("pc_category_l3")}</option>
                {l3Options.map((o) => <option key={o.key} value={o.key}>{o.nameZh}</option>)}
              </Select>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={labelCls}>{t("pc_items")} *</div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a
                href="/downloads/templates/procurement-items-import-template.xlsx"
                download
                className="text-teal-700 underline"
              >
                {t("pc_import_template_xlsx")}
              </a>
              <label className="cursor-pointer rounded-lg border border-dashed border-secondary-300 px-3 py-1.5 text-xs font-semibold text-secondary-600 hover:bg-secondary-50">
                {importing ? "…" : t("pc_import_excel")}
                <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { void onImportExcel(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
            </div>
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
            <span className="flex items-center gap-1.5">
              {t("pc_attachments")}
              <FieldHintTooltip label={t("pc_attachments")} content={t("pc_attachments_hint")} />
            </span>
            <div className="mt-1">
              <Select value={attachKind} onChange={(e) => setAttachKind(e.target.value)} className="mb-2 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm sm:w-64">
                {ATTACHMENT_KINDS.map((k) => <option key={k} value={k}>{t(`pc_attach_${k}`)}</option>)}
              </Select>
              <FileDropzone
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip"
                maxSizeBytes={20 * 1024 * 1024}
                multiple
                files={files}
                onFilesChange={setFiles}
                onReject={(r) => setError(r === "size" ? t("pc_fz_err_size") : t("pc_fz_err_type"))}
              />
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
                <div key={idx} className="grid gap-2 rounded-lg border border-secondary-200 p-3 sm:grid-cols-[1fr_2fr_1fr_1fr]">
                  <input placeholder={t("pc_item_lot")} value={it.lotNo} onChange={(e) => setItem(idx, { lotNo: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <div className="truncate text-sm text-secondary-600">{it.nameZh || "—"}</div>
                  <input placeholder={t("pc_item_qty")} value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                  <input placeholder={t("pc_item_unit")} value={it.qtyUnit} onChange={(e) => setItem(idx, { qtyUnit: e.target.value })} className="rounded-lg border border-secondary-300 px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-secondary-400">{t("pc_items_lang_hint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelCls}>
              <span className="flex items-center gap-1.5">
                {t("pc_budget")}
                <FieldHintTooltip label={t("pc_budget")} content={t("pc_budget_hint")} />
              </span>
              <input
                value={form.budgetAmount}
                onChange={(e) => field("budgetAmount", e.target.value)}
                inputMode="decimal"
                placeholder="1000000"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              {t("pc_currency")}
              <Select value={form.budgetCurrency} onChange={(e) => field("budgetCurrency", e.target.value)} className={inputCls}>
                {[...new Set<string>([...PROCUREMENT_CURRENCIES, form.budgetCurrency].filter(Boolean))].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label className={labelCls}>
              <span className="flex items-center gap-1.5">
                {t("pc_funding_source")}
                <FieldHintTooltip label={t("pc_funding_source")} content={t("pc_funding_source_hint")} />
              </span>
              <Select value={form.fundingSource} onChange={(e) => field("fundingSource", e.target.value)} className={inputCls}>
                <option value="">--</option>
                {["government", "intl_aid", "self_funded", "other"].map((v) => (
                  <option key={v} value={v}>{t(`pc_funding_${v}`)}</option>
                ))}
              </Select>
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
              <SearchableSelect
                options={countrySelectOptions}
                value={form.deliveryCountry || null}
                onChange={(value) => field("deliveryCountry", String(value ?? ""))}
                placeholder={t("pc_country_search")}
                className="mt-1"
              />
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
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_qty_tolerance")}
              <FieldHintTooltip label={t("pc_qty_tolerance")} content={t("pc_qty_tolerance_hint")} />
            </span>
            <input value={form.qtyTolerance} onChange={(e) => field("qtyTolerance", e.target.value)} placeholder={t("pc_qty_tolerance_ph")} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelCls}>
              <span className="flex items-center gap-1.5">
                {t("pc_incoterm")}
                <FieldHintTooltip label={t("pc_incoterm")} content={t("pc_incoterm_hint")} />
              </span>
              <Select
                value={form.incoterm}
                onChange={(e) => field("incoterm", e.target.value)}
                className={inputCls}
              >
                <option value="">--</option>
                {incotermsForVersion(form.incotermVersion || "2020").map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </Select>
            </label>
            <label className={labelCls}>
              {t("pc_incotermVersion")}
              <Select
                value={form.incotermVersion}
                onChange={(e) => {
                  const version = e.target.value;
                  field("incotermVersion", version);
                  field("incoterm", migrateIncoterm(form.incoterm, version));
                }}
                className={inputCls}
              >
                {INCOTERM_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </label>
            <label className={labelCls}>
              {t("pc_incotermPlace")}
              <input
                value={form.incotermPlace}
                onChange={(e) => field("incotermPlace", e.target.value)}
                placeholder={t("pc_incotermPlace_ph")}
                disabled={!form.incoterm}
                className={`${inputCls} disabled:opacity-50`}
              />
            </label>
            <label className={labelCls}>
              {form.method === "eoi" ? t("pc_deadline_eoi") : t("pc_quoteDeadline")} *
              <input type="date" value={form.quoteDeadlineDate} onChange={(e) => field("quoteDeadlineDate", e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_paymentTerms")}
              <FieldHintTooltip label={t("pc_paymentTerms")} content={t("pc_payment_hint")} />
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PAYMENT_PRESET_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => field("paymentTerms", t(key))}
                  className="rounded-full border border-secondary-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-secondary-600 hover:border-teal-400 hover:text-teal-700"
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <textarea
              value={form.paymentTerms}
              onChange={(e) => field("paymentTerms", e.target.value)}
              rows={2}
              placeholder={t("pc_paymentTerms_ph")}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            {t("pc_logisticsNote")}
            <textarea value={form.logisticsNote} onChange={(e) => field("logisticsNote", e.target.value)} rows={2} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={labelCls}>
              <span className="flex items-center gap-1.5">
                {t("pc_installNeeds")}
                <FieldHintTooltip label={t("pc_installNeeds")} content={t("pc_installNeeds_hint")} />
              </span>
              <div className="mt-1 flex flex-wrap gap-2">
                {INSTALL_NEEDS.map((o) => (
                  <button key={o} type="button" onClick={() => field("installNeeds", toggle(form.installNeeds, o))}
                    title={t(`pc_install_${o}_hint`)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.installNeeds.includes(o) ? "border-teal-600 bg-teal-50 text-teal-700" : "border-secondary-300 text-secondary-600"}`}>
                    {t(`pc_install_${o}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-secondary-400">{t("pc_installNeeds_note")}</p>
            </div>
            <div className={labelCls}>
              <span className="flex items-center gap-1.5">
                {t("pc_guarantees")}
                <FieldHintTooltip label={t("pc_guarantees")} content={t("pc_guarantees_hint")} />
              </span>
              <div className="mt-1">
                <GuaranteeEditor
                  value={form.guarantees}
                  onChange={(next) => field("guarantees", next)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-4">
          <div className="border-b border-secondary-100 pb-1 text-sm font-bold text-secondary-700">{t("pc_supplierReqs")}</div>
          <label className={labelCls}>
            {t("pc_supplierType")}
            <Select value={form.supplierType} onChange={(e) => field("supplierType", e.target.value)} className={inputCls}>
              {["any", "manufacturer_or_agent", "manufacturer_only"].map((v) => (
                <option key={v} value={v}>{t(`pc_supplier_type_${v}`)}</option>
              ))}
            </Select>
          </label>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_contracting_mode")}
              <FieldHintTooltip label={t("pc_contracting_mode")} content={t("pc_contracting_mode_hint")} />
            </span>
            <Select value={form.contractingMode} onChange={(e) => field("contractingMode", e.target.value)} className={inputCls}>
              <option value="">--</option>
              {["direct", "consolidated", "undecided"].map((v) => (
                <option key={v} value={v}>{t(`pc_contract_${v}`)}</option>
              ))}
            </Select>
          </label>
          <label className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_supplierQuals")}
              <FieldHintTooltip label={t("pc_supplierQuals")} content={t("pc_supplierQuals_hint")} />
            </span>
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
            <Select value={form.contactDisclosure} onChange={(e) => field("contactDisclosure", e.target.value)} className={inputCls}>
              {CONTACT_DISCLOSURE.map((v) => <option key={v} value={v}>{t(`pc_disc_${v}`)}</option>)}
            </Select>
          </label>
          <div className={labelCls}>
            <span className="flex items-center gap-1.5">
              {t("pc_compliance")}
              <FieldHintTooltip label={t("pc_compliance")} content={t("pc_compliance_hint")} />
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {COMPLIANCE_OPTIONS.map((o) => (
                <button key={o} type="button" onClick={() => field("complianceFlags", toggle(form.complianceFlags, o))}
                  title={t(`pc_comp_${o}_hint`)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${form.complianceFlags.includes(o) ? "border-amber-500 bg-amber-50 text-amber-700" : "border-secondary-300 text-secondary-600"}`}>
                  {t(`pc_comp_${o}`)}
                </button>
              ))}
            </div>
            <label className="mt-2 block text-xs font-semibold text-secondary-600">
              {t("pc_complianceNote")}
              {form.complianceFlags.includes("other") ? " *" : ""}
              <input
                value={form.complianceNote}
                onChange={(e) => field("complianceNote", e.target.value)}
                placeholder={t("pc_complianceNote_ph")}
                className="mt-1 w-full rounded-lg border border-secondary-300 px-3 py-2 text-sm font-normal"
              />
            </label>
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

      <div className="mt-5 flex items-center justify-end">
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
