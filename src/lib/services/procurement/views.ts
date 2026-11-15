/**
 * 采购域响应视图映射器（API 契约：camelCase 实体字段，snake_case 请求参数）
 * @module lib/services/procurement/views
 *
 * @description 路由出口统一过本文件 *ViewOf：门禁（check-api-field-naming）要求
 *              「包在服务返回值里的键」必须过视图 mapper；公开面按 budget_public/
 *              contact_disclosure 分级裁剪（F02 分级授权口径）。
 */
import type { ProjectRow } from "./projects";
import type { BuyerRow, BuyerVerificationRow } from "./buyers";
import { formatBuyerNo } from "./buyer-compliance";
import type { MatchCandidate } from "./matching";
import type { ProjectDetailBundle } from "./projects";

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));
const toStr = (v: unknown): string => String(v ?? "");

/** JSON 列既可能被驱动解析成对象、也可能是字符串；两种都安全转成对象 */
export function toJsonValue(v: unknown): unknown {
  if (v == null || v === "") return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

/** DATE/DATETIME 列：驱动可能返回 Date，统一成 YYYY-MM-DD（前端 date input 口径） */
export function toDateStr(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function buyerViewOf(row: BuyerRow) {
  return {
    id: Number(row.id),
    buyerNo: formatBuyerNo(Number(row.id), Number(row.created_at) || undefined),
    orgName: toStr(row.org_name),
    buyerRole: toStr(row.buyer_role),
    country: toStr(row.country),
    regNo: toStr(row.reg_no),
    taxNo: toStr(row.tax_no),
    website: toStr(row.website),
    officialEmail: toStr(row.official_email),
    officialPhone: toStr(row.official_phone),
    externalRules: toStr(row.external_rules),
    licenseFileUrl: row.license_file_key ? `/api/user/enterprise/license/${toStr(row.license_file_key)}` : null,
    agentAuthFileUrl: row.agent_auth_file_key
      ? `/api/procurement/buyer/auth-doc/${toStr(row.agent_auth_file_key)}`
      : null,
    authContactName: toStr(row.auth_contact_name),
    authContactPhone: toStr(row.auth_contact_phone),
    authContactEmail: toStr(row.auth_contact_email),
    status: toStr(row.status),
    submittedAt: toNum(row.submitted_at),
    verifiedAt: toNum(row.verified_at),
    verifyNote: toStr(row.verify_note),
    createdAt: toNum(row.created_at),
  };
}

/** 广场/列表条目：公开字段 + 分级授权裁剪（budget_public=0 不出金额） */
export function projectSummaryViewOf(row: ProjectRow) {
  const budgetPublic = Number(row.budget_public) === 1;
  return {
    id: Number(row.id),
    reference: toStr(row.reference),
    versionNo: Number(row.version_no),
    status: toStr(row.status),
    titleZh: toStr(row.title_zh),
    titleEn: toStr(row.title_en),
    purpose: toStr(row.purpose),
    objectTypes: toStr(row.object_types).split(",").filter(Boolean),
    primaryUgtCode: toStr(row.primary_ugt_code),
    budgetAmount: budgetPublic ? toNum(row.budget_amount) : null,
    budgetCurrency: budgetPublic ? toStr(row.budget_currency) : null,
    deliveryCountry: toStr(row.delivery_country),
    deliveryCity: toStr(row.delivery_city),
    quoteDeadlineAt: toNum(row.quote_deadline_at),
    publishedAt: toNum(row.published_at),
    createdAt: toNum(row.created_at),
    requirementVerify: toStr(row.requirement_verify),
    fundVerify: toStr(row.fund_verify),
  };
}

/**
 * 详情视图：owner 全量；非 owner 按 F02 分级授权（contact_disclosure）裁剪。
 *
 * 2026-11 整改：`contact_disclosure` 此前只被读出来原样回显（`const disclosure = …` 之后
 * 没有任何分支用它），等于「采购方选了不公开，平台照样全给」。现落地为四个等级：
 *   none        → 不公开采购方身份（机构名置空）+ 预算（除 budget_public=1）
 *   org_only    → 公开机构名；预算仍只看 budget_public
 *   org_contact → 同 org_only（联系方式不在本视图内下发，未来加联系人字段时按此级放开）
 *   budget_all  → 机构名 + 预算
 * 未识别的存量值按 org_only 处理（宁可显示，不静默匿名化历史数据）。
 *
 * 另：`authorization` 里的签署人姓名属个人信息，只给 owner；非 owner 只保留核验状态。
 * 交付地址/物流条款属「需求信息」（供应商报价必需），任何等级都公开——该口径由
 * `publish-chain.test.ts` 的公开详情用例钉住。
 */
export function projectDetailViewOf(bundle: ProjectDetailBundle, opts: { isOwner: boolean }) {
  const row = bundle.project;
  const isOwner = opts.isOwner;
  const rawLevel = toStr(row.contact_disclosure);
  const level: "none" | "org_only" | "org_contact" | "budget_all" =
    rawLevel === "none" || rawLevel === "org_contact" || rawLevel === "budget_all" ? rawLevel : "org_only";
  const showBudget = isOwner || Number(row.budget_public) === 1 || level === "budget_all";
  const showOrgName = isOwner || level !== "none";

  const base = {
    id: Number(row.id),
    reference: toStr(row.reference),
    versionNo: Number(row.version_no),
    status: toStr(row.status),
    closeReason: toStr(row.close_reason),
    titleZh: toStr(row.title_zh),
    titleEn: toStr(row.title_en),
    background: toStr(row.background),
    purpose: toStr(row.purpose),
    internalProjectNo: isOwner ? toStr(row.internal_project_no) : "",
    objectTypes: toStr(row.object_types).split(",").filter(Boolean),
    usageEnv: toStr(row.usage_env),
    standards: toStr(row.standards),
    incotermVersion: toStr(row.incoterm_version),
    batchDelivery: Number(row.batch_delivery) === 1,
    batchNote: toStr(row.batch_note),
    budgetAmount: showBudget ? toNum(row.budget_amount) : null,
    budgetCurrency: showBudget ? toStr(row.budget_currency) : null,
    budgetApproved: showBudget ? toStr(row.budget_approved) : "",
    deliveryCountry: toStr(row.delivery_country),
    deliveryCity: toStr(row.delivery_city),
    deliveryAddress: toStr(row.delivery_address),
    deadlineDate: toDateStr(row.deadline_date),
    installNeeds: toStr(row.install_needs).split(",").filter(Boolean),
    logisticsNote: toStr(row.logistics_note),
    incoterm: toStr(row.incoterm),
    paymentTerms: toStr(row.payment_terms),
    guarantees: toStr(row.guarantees).split(",").filter(Boolean),
    supplierCountryLimit: toStr(row.supplier_country_limit),
    manufacturerOnly: Number(row.manufacturer_only) === 1,
    supplierQuals: toStr(row.supplier_quals),
    supplierConfirmDate: toDateStr(row.supplier_confirm_date),
    contractDate: toDateStr(row.contract_date),
    contactDisclosure: level,
    quoteDeadlineAt: toNum(row.quote_deadline_at),
    compliance: toJsonValue(row.compliance),
    buyerOrgName: showOrgName ? bundle.buyerOrgName : "",
    requirementVerify: toStr(row.requirement_verify),
    fundVerify: toStr(row.fund_verify),
    submittedAt: toNum(row.submitted_at),
    publishedAt: toNum(row.published_at),
    createdAt: toNum(row.created_at),
    // 签署人姓名/签署时间只给 owner（个人信息不外泄）；非 owner 只保留核验状态
    authorization: isOwner
      ? bundle.authorization
      : { status: bundle.authorization.status, signerName: null, signedAt: null },
    isOwner,
  };

  if (!isOwner) {
    // 公开详情：供应商/游客必须能看到"买什么、多少、什么规格"才可能响应（F17 前置）；
    // 附件/核验记录/内部编号等非公开信息不外泄。
    return {
      ...base,
      lots: bundle.lots.map((l) => ({
        // id 供前端把 items.lotId 还原成 lotNo（编辑回填丢标包缺陷的修复基础）
        id: l.id == null ? null : Number(l.id),
        lotNo: toStr(l.lot_no),
        title: toStr(l.title),
        scopeNote: toStr(l.scope_note),
      })),
      items: bundle.items.map((it) => ({
        id: Number(it.id),
        lotId: toNum(it.lot_id),
        lineNo: Number(it.line_no),
        nameZh: toStr(it.name_zh),
        nameEn: toStr(it.name_en),
        spec: toStr(it.spec),
        quantity: toNum(it.quantity),
        qtyUnit: toStr(it.qty_unit),
        qtyType: toStr(it.qty_type),
        ugtCode: toStr(it.ugt_code),
        alternativesAllowed: Number(it.alternatives_allowed) === 1,
      })),
      itemCount: bundle.items.length,
    };
  }

  return {
    ...base,
    budgetPublic: Number(row.budget_public) === 1,
    lots: bundle.lots.map((l) => ({
      id: l.id == null ? null : Number(l.id),
      lotNo: toStr(l.lot_no),
      title: toStr(l.title),
      scopeNote: toStr(l.scope_note),
    })),
    items: bundle.items.map((it) => ({
      id: Number(it.id),
      lotId: toNum(it.lot_id),
      lineNo: Number(it.line_no),
      nameZh: toStr(it.name_zh),
      nameEn: toStr(it.name_en),
      spec: toStr(it.spec),
      quantity: toNum(it.quantity),
      qtyUnit: toStr(it.qty_unit),
      qtyType: toStr(it.qty_type),
      ugtCode: toStr(it.ugt_code),
      attributes: toJsonValue(it.attributes),
      alternativesAllowed: Number(it.alternatives_allowed) === 1,
    })),
    attachments: bundle.attachments.map((a) => ({
      id: Number(a.id),
      versionNo: Number(a.version_no),
      kind: toStr(a.kind),
      filename: toStr(a.filename),
      fileUrl: `/api/procurement/attachment-files/${toStr(a.file_key)}`,
      fileHash: toStr(a.file_hash),
      sizeBytes: Number(a.size_bytes),
      uploadedAt: toNum(a.uploaded_at),
    })),
    reviews: bundle.reviews.map((r) => ({
      id: Number(r.id),
      versionNo: Number(r.version_no),
      stage: toStr(r.stage),
      result: toStr(r.result),
      reviewer: toStr(r.reviewer),
      note: toStr(r.note),
      createdAt: toNum(r.created_at),
    })),
  };
}

/** 主体核验留痕（F05）：认证页只展示结论、核验人与意见，证据文件按权限另取 */
export function buyerVerificationViewOf(row: BuyerVerificationRow) {
  return {
    id: Number(row.id),
    kind: toStr(row.kind),
    result: toStr(row.result),
    reviewer: toStr(row.reviewer),
    note: toStr(row.note),
    hasEvidence: Boolean(row.evidence_file_key),
    createdAt: toNum(row.created_at),
  };
}

export function matchListViewOf(list: MatchCandidate[]) {
  return {
    items: list.map((m) => ({
      supplierId: m.supplierId,
      company: m.company,
      province: m.province,
      city: m.city,
      score: m.score,
      reasons: m.reasons,
    })),
    total: list.length,
  };
}
