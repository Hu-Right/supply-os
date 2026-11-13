/**
 * 存量订单 → 统一订单行 映射（纯函数，无 IO）
 *
 * @module lib/payment/orders/legacy-map
 * @description 四张旧订单表各有一种形状，本模块把它们映射成 `orders` 的同一行，
 *              供回填脚本（scripts/ops/orders-backfill.mts）使用；将来切换读写时，
 *              新下单路径也可以复用同一份口径，避免「回填一套、写入另一套」。
 *
 *   金额一律用**字符串**原样搬运：decimal 列由驱动读出来就是 "199.00"，
 *   过一遍 Number 再回 String 会变成 "199"，财务快照与对账按原串比对。
 *
 *   不含 `server-only`：本模块是纯映射，要被 `tsx scripts/...` 直接跑（那个运行时
 *   没有 react-server 条件，带 server-only 的模块一 import 就抛）。
 *   同理，内部 import 走相对路径而非 `@/` 别名（脚本侧不解析 tsconfig paths）。
 */
import { classifyProductCode, PRODUCT_KIND, stripProductPrefix, type ProductKind } from "../../../shared/constants/product-kind";

/** 统一订单行（列名即 orders 表列名，直接可拼 INSERT） */
export interface UnifiedOrderRow {
  order_no: string;
  user_id: number | null;
  product_kind: ProductKind;
  product_code: string;
  product_name: string;
  unit_price: string;
  quantity: number;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string | null;
  pay_url: string | null;
  qr_code_url: string | null;
  order_type: string;
  original_order_no: string | null;
  industry_code: string | null;
  granted_subscription_id: number | null;
  granted_registration_id: number | null;
  items_snapshot: Record<string, unknown> | null;
  raw_request: unknown;
  raw_notify: unknown;
  paid_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

const money = (v: unknown): string => (v === null || v === undefined ? "0.00" : String(v));
const orNull = <T>(v: T | null | undefined): T | null => (v === null || v === undefined ? null : v);

// ── 旧表行（只声明本模块读到的列，避免与 repo 类型强耦合）──

export interface MembershipOrderRow {
  order_no: string;
  user_id: number;
  plan_code: string;
  amount: string | number;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no?: string | null;
  pay_url?: string | null;
  qr_code_url?: string | null;
  order_type?: string | null;
  original_order_no?: string | null;
  industry_code?: string | null;
  notice_id?: number | null;
  raw_request?: unknown;
  raw_notify?: unknown;
  paid_at?: Date | null;
  created_at: Date;
  updated_at?: Date | null;
}

export interface LearningOrderRow {
  order_no: string;
  user_id: number;
  plan_code: string;
  amount: string | number;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no?: string | null;
  pay_url?: string | null;
  qr_code_url?: string | null;
  raw_request?: unknown;
  raw_notify?: unknown;
  paid_at?: Date | null;
  created_at: Date;
  updated_at?: Date | null;
}

export interface ServiceOrderRow {
  order_no: string;
  user_id: number;
  service_code: string;
  quantity: number;
  unit_price_snapshot: string | number | null;
  amount_total: string | number;
  currency: string;
  status: string;
  sale_mode_snapshot?: string | null;
  granted_subscription_id?: number | null;
  contract_ref?: string | null;
  paid_at?: Date | null;
  created_at: Date;
  updated_at?: Date | null;
}

export interface TrainingOrderRow {
  order_no: string;
  user_id: number | null;
  course_id: number | string;
  schedule_id?: number | null;
  registration_id?: number | null;
  participant_count: number;
  unit_price: string | number;
  total_amount: string | number;
  currency: string;
  provider: string;
  status: string;
  provider_trade_no?: string | null;
  qr_code?: string | null;
  pay_url?: string | null;
  paid_at?: Date | null;
  expires_at?: Date | null;
  created_at: Date;
}

/**
 * 会员单（payment_orders）。
 * 原表不存套餐名，回填时由调用方查 plan_catalog 补 `name`（查不到就退码）。
 * 升级单的 `amount` 是差价，`unit_price` 同样取差价 —— 这一单卖的就是「升级」，
 * 不能拿目标套餐全价当单价，否则按单价×数量对账会对不上。
 */
export function orderFromMembershipRow(row: MembershipOrderRow, name?: string): UnifiedOrderRow {
  return {
    order_no: row.order_no,
    user_id: row.user_id,
    product_kind: PRODUCT_KIND.PLAN,
    product_code: row.plan_code,
    product_name: name ?? row.plan_code,
    unit_price: money(row.amount),
    quantity: 1,
    amount: money(row.amount),
    currency: row.currency || "CNY",
    status: row.status,
    provider: row.provider,
    provider_trade_no: orNull(row.provider_trade_no),
    pay_url: orNull(row.pay_url),
    qr_code_url: orNull(row.qr_code_url),
    order_type: row.order_type === "upgrade" ? "upgrade" : "new",
    original_order_no: orNull(row.original_order_no),
    industry_code: orNull(row.industry_code),
    granted_subscription_id: null,
    granted_registration_id: null,
    items_snapshot: null,
    raw_request: row.raw_request ?? null,
    raw_notify: row.raw_notify ?? null,
    paid_at: orNull(row.paid_at),
    expires_at: null,
    created_at: row.created_at,
    updated_at: orNull(row.updated_at),
  };
}

/**
 * 学习单（learning_orders）。
 * 打包套餐的**包含项**落到 items_snapshot —— 这是原表最缺的一件信息：
 * 旧实现只在履约时去读静态配置 `learning-bundles.ts`，配置一改，历史单就说不清买了什么。
 * 回填只能按**此刻**的配置展开并标注 `expandedAt`；真正的下单时刻已无法还原。
 */
export function orderFromLearningRow(
  row: LearningOrderRow,
  opts?: { name?: string; bundleIncludes?: string[] | null },
): UnifiedOrderRow {
  const kind = classifyProductCode(row.plan_code);
  const isBundle = kind === PRODUCT_KIND.BUNDLE;

  const itemsSnapshot = isBundle
    ? {
        // null 表示该套餐已从静态配置下线，无法展开 —— 如实记录，不编造条目
        includedMaterialIds: opts?.bundleIncludes ?? null,
        expandedAt: new Date().toISOString(),
        note: opts?.bundleIncludes ? "按回填时刻的套餐配置展开" : "套餐已下线，包含项无法还原",
      }
    : null;

  return {
    order_no: row.order_no,
    user_id: row.user_id,
    product_kind: kind,
    product_code: stripProductPrefix(row.plan_code),
    product_name: opts?.name ?? row.plan_code,
    unit_price: money(row.amount),
    quantity: 1,
    amount: money(row.amount),
    currency: row.currency || "CNY",
    status: row.status,
    provider: row.provider,
    provider_trade_no: orNull(row.provider_trade_no),
    pay_url: orNull(row.pay_url),
    qr_code_url: orNull(row.qr_code_url),
    order_type: "new",
    original_order_no: null,
    industry_code: null,
    granted_subscription_id: null,
    granted_registration_id: null,
    items_snapshot: itemsSnapshot,
    raw_request: row.raw_request ?? null,
    raw_notify: row.raw_notify ?? null,
    paid_at: orNull(row.paid_at),
    expires_at: null,
    created_at: row.created_at,
    updated_at: orNull(row.updated_at),
  };
}

/**
 * 增值服务单（service_orders）。
 * 原表无渠道列，`provider` 回填为 `service`（区别于 alipay/wechat/mock），
 * 在 orders 里它是「非在线网关支付」的标记，不要当成渠道去查网关。
 */
export function orderFromServiceRow(row: ServiceOrderRow, name?: string): UnifiedOrderRow {
  return {
    order_no: row.order_no,
    user_id: row.user_id,
    product_kind: PRODUCT_KIND.SERVICE,
    product_code: row.service_code,
    product_name: name ?? row.service_code,
    unit_price: money(row.unit_price_snapshot ?? row.amount_total),
    quantity: Number(row.quantity) || 1,
    amount: money(row.amount_total),
    currency: row.currency || "CNY",
    status: row.status,
    provider: "service",
    provider_trade_no: null,
    pay_url: null,
    qr_code_url: null,
    order_type: "new",
    original_order_no: null,
    industry_code: null,
    granted_subscription_id: orNull(row.granted_subscription_id),
    granted_registration_id: null,
    items_snapshot: row.sale_mode_snapshot
      ? { saleMode: row.sale_mode_snapshot, contractRef: row.contract_ref ?? null }
      : null,
    raw_request: null,
    raw_notify: null,
    paid_at: orNull(row.paid_at),
    expires_at: null,
    created_at: row.created_at,
    updated_at: orNull(row.updated_at),
  };
}

/**
 * 培训单（training_orders）。
 * 商品码用课程 id（培训没有 SKU 码），期次与报名行分别是「构成」与「履约」。
 */
export function orderFromTrainingRow(row: TrainingOrderRow, name?: string): UnifiedOrderRow {
  return {
    order_no: row.order_no,
    user_id: orNull(row.user_id === null || row.user_id === undefined ? null : Number(row.user_id)),
    product_kind: PRODUCT_KIND.COURSE,
    product_code: String(row.course_id),
    product_name: name ?? `training_course_${row.course_id}`,
    unit_price: money(row.unit_price),
    quantity: Number(row.participant_count) || 1,
    amount: money(row.total_amount),
    currency: row.currency || "CNY",
    status: row.status,
    provider: row.provider,
    provider_trade_no: orNull(row.provider_trade_no),
    pay_url: null,
    qr_code_url: null,
    order_type: "new",
    original_order_no: null,
    industry_code: null,
    granted_subscription_id: null,
    granted_registration_id: orNull(row.registration_id),
    items_snapshot: {
      courseId: Number(row.course_id),
      scheduleId: orNull(row.schedule_id),
    },
    raw_request: null,
    raw_notify: null,
    paid_at: orNull(row.paid_at),
    expires_at: orNull(row.expires_at),
    created_at: row.created_at,
    updated_at: null,
  };
}

/** orders 表插入列顺序（脚本与将来双写共用，避免两处列名漂移） */
export const ORDERS_COLUMNS = [
  "order_no", "user_id", "product_kind", "product_code", "product_name",
  "unit_price", "quantity", "amount", "currency", "status",
  "provider", "provider_trade_no", "pay_url", "qr_code_url", "order_type", "original_order_no",
  "industry_code", "granted_subscription_id", "granted_registration_id",
  "items_snapshot", "raw_request", "raw_notify", "paid_at", "expires_at",
  "created_at", "updated_at",
] as const;

/** 行 → 插入参数数组（JSON 列在此序列化，日期原样交给驱动） */
export function orderInsertParams(row: UnifiedOrderRow): unknown[] {
  return ORDERS_COLUMNS.map((col) => {
    const v = (row as unknown as Record<string, unknown>)[col];
    if (col === "items_snapshot" || col === "raw_request" || col === "raw_notify") {
      return v === null || v === undefined ? null : JSON.stringify(v);
    }
    return v ?? null;
  });
}
