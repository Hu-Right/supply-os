/**
 * 采购域响应视图映射器（API 契约：camelCase 实体字段，snake_case 请求参数）
 * @module lib/services/procurement/views
 *
 * @description 路由出口统一过本文件 *ViewOf：门禁（check-api-field-naming）要求
 *              「包在服务返回值里的键」必须过视图 mapper；公开面按 budget_public/
 *              contact_disclosure 分级裁剪（F02 分级授权口径）。
 */
import type { RowDataPacket } from "mysql2/promise";
import type { ProjectRow } from "./projects";
import type { BuyerRow } from "./buyers";
import type { MatchCandidate } from "./matching";
import type { ProjectDetailBundle } from "./projects";

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));
const toStr = (v: unknown): string => String(v ?? "");

export function buyerViewOf(row: BuyerRow) {
  return {
    id: Number(row.id),
    orgName: toStr(row.org_name),
    orgType: toStr(row.org_type),
    buyerRole: toStr(row.buyer_role),
    country: toStr(row.country),
    address: toStr(row.address),
    regNo: toStr(row.reg_no),
    taxNo: toStr(row.tax_no),
    website: toStr(row.website),
    officialEmail: toStr(row.official_email),
    officialPhone: toStr(row.official_phone),
    leaderName: toStr(row.leader_name),
    leaderTitle: toStr(row.leader_title),
    leaderPhone: toStr(row.leader_phone),
    leaderEmail: toStr(row.leader_email),
    deliverCountry: toStr(row.deliver_country),
    deliverCity: toStr(row.deliver_city),
    fundSource: toStr(row.fund_source),
    budgetStatus: toStr(row.budget_status),
    externalRules: toStr(row.external_rules),
    licenseFileUrl: row.license_file_key ? `/api/user/enterprise/license/${toStr(row.license_file_key)}` : null,
    status: toStr(row.status),
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
  };
}

/** 详情视图：owner 全量，非 owner 按 F02 分级授权裁剪 */
export function projectDetailViewOf(bundle: ProjectDetailBundle, opts: { isOwner: boolean }) {
  const row = bundle.project;
  const isOwner = opts.isOwner;
  const showBudget = isOwner || Number(row.budget_public) === 1;
  const disclosure = toStr(row.contact_disclosure);

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
    budgetAmount: showBudget ? toNum(row.budget_amount) : null,
    budgetCurrency: showBudget ? toStr(row.budget_currency) : null,
    budgetApproved: showBudget ? toStr(row.budget_approved) : "",
    deliveryCountry: toStr(row.delivery_country),
    deliveryCity: toStr(row.delivery_city),
    deliveryAddress: isOwner || disclosure === "budget_all" ? toStr(row.delivery_address) : "",
    deadlineDate: toStr(row.deadline_date),
    installNeeds: toStr(row.install_needs).split(",").filter(Boolean),
    logisticsNote: isOwner ? toStr(row.logistics_note) : "",
    incoterm: toStr(row.incoterm),
    paymentTerms: toStr(row.payment_terms),
    guarantees: toStr(row.guarantees).split(",").filter(Boolean),
    supplierCountryLimit: toStr(row.supplier_country_limit),
    manufacturerOnly: Number(row.manufacturer_only) === 1,
    supplierQuals: toStr(row.supplier_quals),
    quoteDeadlineAt: toNum(row.quote_deadline_at),
    compliance: row.compliance ? JSON.parse(String(row.compliance)) : null,
    buyerOrgName: bundle.buyerOrgName,
    procurementMode: toStr(row.procurement_mode),
    requirementVerify: toStr(row.requirement_verify),
    fundVerify: toStr(row.fund_verify),
    submittedAt: toNum(row.submitted_at),
    publishedAt: toNum(row.published_at),
    createdAt: toNum(row.created_at),
    authorization: bundle.authorization,
    isOwner,
  };

  if (!isOwner) return base;

  return {
    ...base,
    lots: bundle.lots.map((l) => ({
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
      attributes: it.attributes ? JSON.parse(String(it.attributes)) : null,
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
