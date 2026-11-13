/**
 * RFQ 提交校验 · 唯一校验器
 * @module lib/services/rfq/validate
 *
 * @description 重构前存在三套长度口径：SSOT（`WIDE_LIMITS.rfq*`）、路由里写死的字面量、
 *              前端组件里的 maxLength，且服务端上限普遍**大于列宽**（contact_name 100 vs
 *              varchar(64)、delivery_address 500 vs varchar(255)…），长输入在严格模式下
 *              直接 1406 → 统一回"创建失败"，不可诊断。
 *
 *              本模块的规则只有一条：**服务端放行上限 = min(业务 SSOT, 列宽)**，
 *              错误以「字段 → 文案」判别联合返回，前端逐字段定位，不靠中文串猜。
 */
import { WIDE_LIMITS } from "@/lib/utils/notice-field-limits";

/** 列宽约束（与 db/schema 的 rfq_demand DDL 一一对应；改 DDL 必须同步改这里） */
export const DEMAND_COLUMN_LIMITS = {
  title: 50,
  description: 2000,
  categoryCode: 24,
  provinceName: 50,
  quantityUnit: 20,
  incoterm: 16,
  deliveryTime: 64,
  deliveryAddress: 255,
  paymentTerms: 255,
  supplierReqs: 500,
  contactName: 64,
  contactEmail: 128,
  contactPhone: 32,
} as const;

/** 允许的贸易术语（与前端 INCOTERM_OPTIONS 同源，收敛到服务端一份） */
export const DEMAND_INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"] as const;

export interface DemandDraftInput {
  title: string;
  description: string;
  categoryCode?: string | null;
  closeAt?: number | null;
  budgetAmount?: number | null;
  budgetConfidential?: boolean;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  incoterm?: string | null;
  deliveryTime?: string | null;
  provinceName?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
}

export interface FieldError {
  field: string;
  message: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: FieldError[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function limit(ssot: number, column: number): number {
  return Math.min(ssot, column);
}

/** 提交审核前的完整校验（草稿保存只调 `validateDraftPartial`） */
export function validateDemandDraft(
  input: DemandDraftInput,
  nowSec: number = Math.floor(Date.now() / 1000),
): ValidationResult {
  const errors: FieldError[] = [];
  const push = (field: string, message: string) => errors.push({ field, message });

  const title = (input.title ?? "").trim();
  const titleMax = limit(WIDE_LIMITS.rfqTitle, DEMAND_COLUMN_LIMITS.title);
  if (title.length < WIDE_LIMITS.rfqTitleMin) {
    push("title", `标题至少 ${WIDE_LIMITS.rfqTitleMin} 个字（当前 ${title.length}）`);
  } else if (title.length > titleMax) {
    push("title", `标题不能超过 ${titleMax} 个字`);
  }

  const category = (input.categoryCode ?? "").trim();
  if (!category) push("categoryCode", "请选择产品/服务分类");
  else if (category.length > DEMAND_COLUMN_LIMITS.categoryCode) {
    push("categoryCode", "分类码非法");
  }

  const desc = (input.description ?? "").trim();
  const descMax = limit(WIDE_LIMITS.rfqDescription, DEMAND_COLUMN_LIMITS.description);
  if (desc.length < WIDE_LIMITS.rfqDescriptionMin) {
    push("description", `描述至少 ${WIDE_LIMITS.rfqDescriptionMin} 个字（当前 ${desc.length}）`);
  } else if (desc.length > descMax) {
    push("description", `描述不能超过 ${descMax} 字`);
  }

  if (input.closeAt == null || !Number.isFinite(input.closeAt)) {
    push("closeAt", "请选择报价截止时间");
  } else if (input.closeAt <= nowSec) {
    push("closeAt", "截止时间必须晚于当前时间");
  }

  const confidential = Boolean(input.budgetConfidential);
  if (!confidential) {
    const amount = Number(input.budgetAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push("budgetAmount", "请输入有效的预算金额（大于 0），或勾选预算保密");
    }
  } else if (input.budgetAmount != null && Number(input.budgetAmount) < 0) {
    push("budgetAmount", "预算金额不能为负数");
  }

  const contactName = (input.contactName ?? "").trim();
  if (!contactName) push("contactName", "请填写联系人姓名");
  else if (contactName.length > DEMAND_COLUMN_LIMITS.contactName) {
    push("contactName", `联系人姓名不能超过 ${DEMAND_COLUMN_LIMITS.contactName} 字`);
  }

  const contactEmail = (input.contactEmail ?? "").trim();
  if (!contactEmail) push("contactEmail", "请填写联系邮箱");
  else if (contactEmail.length > DEMAND_COLUMN_LIMITS.contactEmail) {
    push("contactEmail", `联系邮箱不能超过 ${DEMAND_COLUMN_LIMITS.contactEmail} 字`);
  } else if (!EMAIL_RE.test(contactEmail)) {
    push("contactEmail", "请输入有效邮箱，报价通知将发送至此");
  }

  const phone = (input.contactPhone ?? "").trim();
  if (phone.length > DEMAND_COLUMN_LIMITS.contactPhone) {
    push("contactPhone", `联系电话不能超过 ${DEMAND_COLUMN_LIMITS.contactPhone} 字`);
  }

  const incoterm = (input.incoterm ?? "").trim();
  if (!incoterm) push("incoterm", "请选择贸易术语");
  else if (!(DEMAND_INCOTERMS as readonly string[]).includes(incoterm)) {
    push("incoterm", "贸易术语不在允许范围内");
  }

  if ((input.deliveryTime ?? "").trim().length > DEMAND_COLUMN_LIMITS.deliveryTime) {
    push("deliveryTime", `交付时间不能超过 ${DEMAND_COLUMN_LIMITS.deliveryTime} 字`);
  }

  if ((input.provinceName ?? "").trim().length > DEMAND_COLUMN_LIMITS.provinceName) {
    push("provinceName", "省份名称过长");
  }

  if (input.quantity != null && Number(input.quantity) <= 0) {
    push("quantity", "数量必须大于 0");
  }
  if ((input.quantityUnit ?? "").trim().length > DEMAND_COLUMN_LIMITS.quantityUnit) {
    push("quantityUnit", "计量单位过长");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * 报价窗口建议值检查（不阻断，只提示）：窗口过短会显著降低报价率。
 * 返回 true 表示"建议延长"。
 */
export function isQuoteWindowShort(closeAt: number, nowSec: number): boolean {
  const days = (closeAt - nowSec) / 86400;
  return days < 7;
}
