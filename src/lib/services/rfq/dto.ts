/**
 * RFQ 读模型 DTO
 * @module lib/services/rfq/dto
 *
 * @description 读写分离：`rfq_demand` 是写模型（业务态），本模块把它映射成两种读模型：
 *              - `DemandDetailDTO`：详情页（含 owner 视角 / 受限视角）；
 *              - `DemandListItemDTO`：工作台列表。
 *
 *              同时保留少数**旧字段别名**（`budget` 万元、`deadlineSec`、`budgetUsd`），
 *              让前端可以分批切换；新代码一律用 `budgetAmount`（元）+ `closeAt`（秒），
 *              展示格式化只在 `shared/utils` 与 `features/rfq/model/status.ts` 各一处。
 */
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";

export interface DemandRowLike {
  id: number;
  reference: string;
  status: string;
  revision_no: number;
  title: string;
  description: string | null;
  category_code: string | null;
  province_name: string | null;
  purchase_type: string | null;
  quantity: string | number | null;
  quantity_unit: string | null;
  budget_amount: string | number | null;
  budget_currency: string;
  budget_confidential: number;
  incoterm: string | null;
  delivery_time: string | null;
  delivery_address: string | null;
  payment_terms: string | null;
  supplier_reqs: string | null;
  visibility: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  terms_version: string | null;
  agreed_at: number | null;
  close_at: number | null;
  open_at: number | null;
  submitted_at: number | null;
  reviewed_at: number | null;
  reject_reason: string | null;
  close_reason: string | null;
  notice_pk: number | null;
  created_at: number | null;
  category_l1_name?: string | null;
  category_l2_name?: string | null;
}

const splitList = (v: string | null): string[] =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const toAmount = (v: string | number | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface DemandDetailDTO {
  id: number;
  reference: string;
  title: string;
  description: string;
  status: string;
  revision: number;
  /** 品目码 + 名称（名称来自骨架表 JOIN，缺失时为空串） */
  categoryCode: string;
  categoryL1: string;
  categoryL2: string;
  province: string;
  purchaseType: string;
  quantity: number | null;
  quantityUnit: string;
  /** 预算（元） */
  budgetAmount: number | null;
  budgetConfidential: boolean;
  /** 旧字段：万元口径，供未迁移的 UI 使用 */
  budget: number | null;
  currency: string;
  incoterm: string;
  deliveryTime: string;
  deliveryAddress: string;
  paymentTerms: string[];
  supplierReqs: string[];
  visibility: string;
  /** 旧字段名：截止时间（秒） */
  deadlineSec: number;
  closeAt: number | null;
  openAt: number | null;
  /** 搜索投影行 id；供应商侧报价/邀约/选定仍以它为准（过渡期桥接，P2 迁到 demand_id） */
  noticePk: number | null;
  publishedDate: string | null;
  submittedAt: number | null;
  reviewedAt: number | null;
  rejectReason: string;
  closeReason: string;
  createdAt: number | null;
  isOwner: boolean;
  restricted: boolean;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/** 详情视图。restricted=true 时只输出摘要（定向需求对非受邀者） */
export function toDetailView(
  row: DemandRowLike,
  opts: { isOwner: boolean; restricted?: boolean },
): DemandDetailDTO {
  const confidential = Number(row.budget_confidential) === 1;
  const amount = confidential ? null : toAmount(row.budget_amount);
  const base: DemandDetailDTO = {
    id: Number(row.id),
    reference: String(row.reference ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status ?? DEMAND_STATUS.DRAFT),
    revision: Number(row.revision_no ?? 0),
    categoryCode: String(row.category_code ?? ""),
    categoryL1: String(row.category_l1_name ?? ""),
    categoryL2: String(row.category_l2_name ?? ""),
    province: String(row.province_name ?? ""),
    purchaseType: String(row.purchase_type ?? ""),
    quantity: toAmount(row.quantity),
    quantityUnit: String(row.quantity_unit ?? ""),
    budgetAmount: amount,
    budgetConfidential: confidential,
    budget: amount === null ? null : Math.round(amount / 100) / 100,
    currency: String(row.budget_currency || "CNY"),
    incoterm: String(row.incoterm ?? ""),
    deliveryTime: String(row.delivery_time ?? ""),
    deliveryAddress: String(row.delivery_address ?? ""),
    paymentTerms: splitList(row.payment_terms),
    supplierReqs: splitList(row.supplier_reqs),
    visibility: String(row.visibility || "public"),
    deadlineSec: Number(row.close_at ?? 0),
    closeAt: row.close_at == null ? null : Number(row.close_at),
    openAt: row.open_at == null ? null : Number(row.open_at),
    noticePk: row.notice_pk == null ? null : Number(row.notice_pk),
    publishedDate: row.reviewed_at == null ? null : String(row.reviewed_at),
    submittedAt: row.submitted_at == null ? null : Number(row.submitted_at),
    reviewedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
    rejectReason: String(row.reject_reason ?? ""),
    closeReason: String(row.close_reason ?? ""),
    createdAt: row.created_at == null ? null : Number(row.created_at),
    isOwner: opts.isOwner,
    restricted: Boolean(opts.restricted),
  };

  if (opts.isOwner) {
    base.contactName = String(row.contact_name ?? "");
    base.contactEmail = String(row.contact_email ?? "");
    base.contactPhone = String(row.contact_phone ?? "");
  }
  return base;
}

/** 受限摘要：定向需求对非受邀者只回这些字段（不含描述/预算/商务条款） */
export function toRestrictedView(row: DemandRowLike): DemandDetailDTO {
  const full = toDetailView(row, { isOwner: false, restricted: true });
  return {
    ...full,
    description: "",
    budgetAmount: null,
    budget: null,
    budgetConfidential: false,
    incoterm: "",
    deliveryTime: "",
    deliveryAddress: "",
    paymentTerms: [],
    supplierReqs: [],
  };
}

export interface DemandListItemDTO {
  id: number;
  reference: string;
  title: string;
  status: string;
  revision: number;
  province: string;
  /** 预算（元）；保密时 null */
  budgetAmount: number | null;
  budgetConfidential: boolean;
  /** 旧字段：万元口径（未迁移的 UI 仍读它） */
  budgetUsd: number;
  currency: string;
  deadlineSec: number;
  submittedAt: number | null;
  publishedAt: number | null;
  rejectReason: string;
  closeReason: string;
  createdAt: number | null;
  quoteCount: number;
  quotePending: number;
}

export function toListItemDTO(
  row: DemandRowLike,
  counts: { quoteCount?: number; quotePending?: number } = {},
): DemandListItemDTO {
  const confidential = Number(row.budget_confidential) === 1;
  const amount = confidential ? null : toAmount(row.budget_amount);
  return {
    id: Number(row.id),
    reference: String(row.reference ?? ""),
    title: String(row.title ?? ""),
    status: String(row.status ?? DEMAND_STATUS.DRAFT),
    revision: Number(row.revision_no ?? 0),
    province: String(row.province_name ?? ""),
    budgetAmount: amount,
    budgetConfidential: confidential,
    budgetUsd: amount === null ? 0 : Math.round(amount / 100) / 100,
    currency: String(row.budget_currency || "CNY"),
    deadlineSec: Number(row.close_at ?? 0),
    submittedAt: row.submitted_at == null ? null : Number(row.submitted_at),
    publishedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
    rejectReason: String(row.reject_reason ?? ""),
    closeReason: String(row.close_reason ?? ""),
    createdAt: row.created_at == null ? null : Number(row.created_at),
    quoteCount: Number(counts.quoteCount ?? 0),
    quotePending: Number(counts.quotePending ?? 0),
  };
}
