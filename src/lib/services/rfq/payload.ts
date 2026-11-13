/**
 * RFQ 请求体归一化
 * @module lib/services/rfq/payload
 *
 * @description 前端/外部调用可能同时存在两套字段名（旧向导的 `budget` 万元 / `deadline` 日期串，
 *              新设计的 `budgetAmount` 元 / `closeAt` 秒）。归一化只做**形状与单位转换**，
 *              不做业务校验（业务校验在 submit 的 validate 里，草稿允许不完整）。
 *
 *              单位口径必须一次说清，否则又会回到"万元当元"：
 *              - `budgetAmount` = **元**（新口径，推荐）
 *              - `budget`       = **万元**（旧口径，仅过渡期兼容，×10000 后入库）
 *              - `closeAt`      = 秒级时间戳；`deadline` 为 `yyyy-MM-dd`，按 Asia/Shanghai 日终折算
 */
import { QUOTE_WINDOW_MIN_DAYS } from "@/shared/constants/rfq-demand";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

/** `yyyy-MM-dd` → 当日 23:59:59（Asia/Shanghai）的秒级时间戳 */
export function deadlineDateToCloseAt(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Date.UTC(y, mo-1, d, 23, 59, 59) 减 8 小时 = 上海当天 23:59:59 对应的 UTC 秒
  const utc = Date.UTC(y, mo - 1, d, 23, 59, 59);
  if (Number.isNaN(utc)) return null;
  return Math.floor(utc / 1000) - SHANGHAI_OFFSET_SEC;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 数组（付款方式/供应商要求）→ 逗号拼接（列宽有限，调用方仍需自行控制条数） */
function joinList(v: unknown): string | null {
  if (Array.isArray(v)) {
    const parts = v.map((x) => str(x)).filter(Boolean);
    return parts.length ? parts.join(",") : null;
  }
  return strOrNull(v);
}

export interface NormalizedDemandPatch {
  title?: string;
  description?: string | null;
  categoryCode?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  purchaseType?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string;
  budgetConfidential?: boolean;
  incoterm?: string | null;
  deliveryTime?: string | null;
  deliveryAddress?: string | null;
  paymentTerms?: string | null;
  supplierReqs?: string | null;
  visibility?: "public" | "targeted";
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  termsVersion?: string | null;
  agreedAt?: number | null;
  closeAt?: number | null;
}

/** 解析截止时间：`closeAt`（秒）优先，其次 `deadline`（上海日终） */
export function resolveCloseAt(body: Record<string, unknown>): number | null {
  const direct = numOrNull(body.closeAt);
  if (direct !== null) return Math.trunc(direct);
  const deadline = str(body.deadline);
  if (deadline) return deadlineDateToCloseAt(deadline);
  return null;
}

/** 解析预算（元）：`budgetAmount` 优先，`budget`（万元）换算 */
export function resolveBudgetAmount(body: Record<string, unknown>): number | null {
  if (body.budgetAmount !== undefined) return numOrNull(body.budgetAmount);
  if (body.budget !== undefined) {
    const wan = numOrNull(body.budget);
    return wan === null ? null : wan * 10_000;
  }
  return null;
}

/** 建单入参归一化（不做业务校验） */
export function normalizeCreatePayload(body: Record<string, unknown>): NormalizedDemandPatch {
  const agreed = Boolean(body.agreed);
  const agreedAt = numOrNull(body.agreedAt) ?? (agreed ? Math.floor(Date.now() / 1000) : null);
  const patch: NormalizedDemandPatch = {
    title: str(body.title),
    description: strOrNull(body.description),
    categoryCode: strOrNull(body.categoryCode) ?? strOrNull(body.category_code),
    provinceCode: strOrNull(body.provinceCode) ?? strOrNull(body.province_code),
    provinceName: strOrNull(body.provinceName) ?? strOrNull(body.province_name),
    purchaseType: strOrNull(body.purchaseType) ?? strOrNull(body.purchase_type),
    quantity: numOrNull(body.quantity),
    quantityUnit: strOrNull(body.quantityUnit) ?? strOrNull(body.quantity_unit),
    budgetAmount: resolveBudgetAmount(body),
    budgetCurrency: str(body.budgetCurrency) || str(body.currency) || "CNY",
    budgetConfidential: Boolean(body.budgetConfidential ?? body.budget_confidential),
    incoterm: strOrNull(body.incoterm),
    deliveryTime: strOrNull(body.deliveryTime) ?? strOrNull(body.delivery_time),
    deliveryAddress: strOrNull(body.deliveryAddress) ?? strOrNull(body.delivery_address),
    paymentTerms: joinList(body.paymentTerms ?? body.payment_terms),
    supplierReqs: joinList(body.supplierReqs ?? body.supplier_reqs),
    visibility: (str(body.visibility) === "targeted" ? "targeted" : "public"),
    contactName: strOrNull(body.contactName) ?? strOrNull(body.contact_name),
    contactEmail: strOrNull(body.contactEmail) ?? strOrNull(body.contact_email),
    contactPhone: strOrNull(body.contactPhone) ?? strOrNull(body.contact_phone),
    termsVersion: strOrNull(body.termsVersion) ?? (agreed ? "v1" : null),
    agreedAt,
    closeAt: resolveCloseAt(body),
  };
  return patch;
}

/**
 * 编辑入参归一化：**只包含请求里出现的字段**（PATCH 语义）。
 * 这样"只改币种"不会顺带把预算重算成 0（旧实现的数据损坏级缺陷）。
 */
export function normalizeUpdatePayload(body: Record<string, unknown>): NormalizedDemandPatch {
  const patch: NormalizedDemandPatch = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has("title")) patch.title = str(body.title);
  if (has("description")) patch.description = strOrNull(body.description);
  if (has("categoryCode") || has("category_code")) {
    patch.categoryCode = strOrNull(body.categoryCode ?? body.category_code);
  }
  if (has("provinceCode") || has("province_code")) {
    patch.provinceCode = strOrNull(body.provinceCode ?? body.province_code);
  }
  if (has("provinceName") || has("province_name")) {
    patch.provinceName = strOrNull(body.provinceName ?? body.province_name);
  }
  if (has("purchaseType") || has("purchase_type")) {
    patch.purchaseType = strOrNull(body.purchaseType ?? body.purchase_type);
  }
  if (has("quantity")) patch.quantity = numOrNull(body.quantity);
  if (has("quantityUnit") || has("quantity_unit")) {
    patch.quantityUnit = strOrNull(body.quantityUnit ?? body.quantity_unit);
  }
  if (has("budgetAmount") || has("budget")) patch.budgetAmount = resolveBudgetAmount(body);
  if (has("budgetCurrency") || has("currency")) {
    patch.budgetCurrency = str(body.budgetCurrency ?? body.currency) || "CNY";
  }
  if (has("budgetConfidential") || has("budget_confidential")) {
    patch.budgetConfidential = Boolean(body.budgetConfidential ?? body.budget_confidential);
  }
  if (has("incoterm")) patch.incoterm = strOrNull(body.incoterm);
  if (has("deliveryTime") || has("delivery_time")) {
    patch.deliveryTime = strOrNull(body.deliveryTime ?? body.delivery_time);
  }
  if (has("deliveryAddress") || has("delivery_address")) {
    patch.deliveryAddress = strOrNull(body.deliveryAddress ?? body.delivery_address);
  }
  if (has("paymentTerms") || has("payment_terms")) {
    patch.paymentTerms = joinList(body.paymentTerms ?? body.payment_terms);
  }
  if (has("supplierReqs") || has("supplier_reqs")) {
    patch.supplierReqs = joinList(body.supplierReqs ?? body.supplier_reqs);
  }
  if (has("visibility")) patch.visibility = str(body.visibility) === "targeted" ? "targeted" : "public";
  if (has("contactName") || has("contact_name")) {
    patch.contactName = strOrNull(body.contactName ?? body.contact_name);
  }
  if (has("contactEmail") || has("contact_email")) {
    patch.contactEmail = strOrNull(body.contactEmail ?? body.contact_email);
  }
  if (has("contactPhone") || has("contact_phone")) {
    patch.contactPhone = strOrNull(body.contactPhone ?? body.contact_phone);
  }
  if (has("termsVersion") || has("terms_version")) {
    patch.termsVersion = strOrNull(body.termsVersion ?? body.terms_version);
  }
  if (has("agreedAt") || has("agreed")) {
    patch.agreedAt = numOrNull(body.agreedAt) ?? (body.agreed ? Math.floor(Date.now() / 1000) : null);
  }
  if (has("closeAt") || has("deadline")) patch.closeAt = resolveCloseAt(body);
  return patch;
}

/** 报价窗口是否低于硬下限（天）——用于创建时的软提示 */
export function isCloseAtTooSoon(closeAt: number | null, nowSec: number): boolean {
  if (closeAt === null) return false;
  return closeAt < nowSec + QUOTE_WINDOW_MIN_DAYS * 86400;
}
