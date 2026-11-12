/**
 * 商品定价解析 — 四处取价合流
 * Product pricing resolvers
 *
 * @module lib/payment/products/resolve
 * @description 四种商品的定价此前各写在各自的 createOrder 里，四套「取价 + 取名 + 币种默认」
 *              逻辑互不相识：
 *              - 会员套餐 → plan_catalog（经 BenefitSystemRepo.getPlan）
 *              - 增值服务 → service_catalog（内联 SQL，且 sale_mode/price_from 有额外语义）
 *              - 学习资料 / 打包 → learning_materials（DB）/ learning-bundles（静态 TS）
 *              - 培训课程 → training_courses.unit_price
 *
 *              **分工原则**：调用方手里已经有目录行的，本模块只提供**纯映射**
 *              （`planProductOf` / `serviceProductOf` / `courseProductOf`）——它们除了取价还要
 *              用整行做别的判断（升级差价、年包抵扣、课程 id、名额），再查一次库纯属浪费；
 *              调用方只有「码」没有行的（学习类），提供 **async 解析**（`resolveLearningProduct`）。
 *
 *              **业务判定与错误码仍留调用方**：四家错误码不同、先后顺序也不同，见 types.ts。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PRODUCT_KIND, classifyProductCode, stripProductPrefix } from "@/shared/constants/product-kind";
import { findLearningBundle } from "../../data/learning-bundles";
import type {
  ProductResolution,
  ProductUnavailableReason,
  ResolvedProduct,
} from "./types";

// ── 注入行的结构型（不 import repos，避免 products→repos 的反向耦合）──

/** plan_catalog 行的定价相关子集（PlanCatalogRow 结构可赋值） */
export interface PlanPriceInput {
  plan_code: string;
  name_zh: string;
  price: string | number;
  currency?: string | null;
  is_active: number | string;
  price_mode: string;
}

/** service_catalog 定价行（fetchServicePriceRow 的输出） */
export interface ServicePriceInput {
  standard_price: string | number | null;
  currency: string | null;
  sale_mode: string;
  price_from: number | string | null;
  is_active: number;
  name_zh: string | null;
}

/** learning_materials 行的定价相关子集 */
export interface MaterialPriceInput {
  title_zh?: string | null;
  title_en?: string | null;
  price: number | string;
}

/** training_courses 行的定价相关子集 */
export interface CoursePriceInput {
  id: number | string;
  name_zh?: string | null;
  unit_price?: number | string | null;
  currency?: string | null;
}

const DEFAULT_CURRENCY = "CNY";

const missing = (reason: ProductUnavailableReason): ProductResolution => ({ ok: false, reason });

/**
 * 会员套餐：定价来自 plan_catalog。
 * 入参为非空目录行 —— 「查不到」这个判定连同它的错误码（PLAN_NOT_FOUND）留在调用方，
 * 因为调用方本来就要拿整行做升级/年包抵扣判断，不该为了取价再查一次库。
 * `sellable` 等价于原 `is_active !== 1 || price_mode !== "fixed"` → PLAN_NOT_SELLABLE。
 */
export function planProductOf(planCode: string, plan: PlanPriceInput): ResolvedProduct {
  return {
    kind: PRODUCT_KIND.PLAN,
    code: planCode,
    // 与原实现一致：不做 name 兜底（渠道商品描述取目录名）
    name: plan.name_zh,
    unitPrice: Number(plan.price),
    priceRaw: String(plan.price),
    currency: plan.currency || DEFAULT_CURRENCY,
    sellable: Number(plan.is_active) === 1 && plan.price_mode === "fixed",
    priceSource: "plan_catalog",
  };
}

/** 增值服务目录行读取（原内联在 ServicePaymentService.createOrder 里的那条 SQL） */
export async function fetchServicePriceRow(
  pool: Pool,
  serviceCode: string,
): Promise<ServicePriceInput | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT standard_price, currency, sale_mode, price_from, is_active, name_zh
       FROM service_catalog WHERE service_code = ? LIMIT 1`,
    [serviceCode],
  );
  return (rows[0] as ServicePriceInput | undefined) ?? null;
}

/**
 * 增值服务：入参为非空目录行。
 * `advisoryOnly` 等价于原 `sale_mode !== "self" || price_from === 1` → SERVICE_ADVISORY_ONLY。
 * 调用方判定顺序须保持「先不可售、后仅预约」，与原实现一致。
 */
export function serviceProductOf(
  serviceCode: string,
  svc: ServicePriceInput,
): ResolvedProduct {
  const priceRaw = svc.standard_price === null ? "" : String(svc.standard_price);
  return {
    kind: PRODUCT_KIND.SERVICE,
    code: serviceCode,
    name: svc.name_zh || serviceCode,
    unitPrice: priceRaw === "" ? 0 : Number(priceRaw),
    priceRaw,
    currency: svc.currency || DEFAULT_CURRENCY,
    // 与原实现逐字一致：无价 / 下架 / 非正价 → 不可售
    sellable: svc.is_active === 1 && svc.standard_price !== null && Number(svc.standard_price) > 0,
    advisoryOnly: svc.sale_mode !== "self" || Number(svc.price_from) === 1,
    saleMode: svc.sale_mode,
    priceSource: "service_catalog",
  };
}

/**
 * 学习资料 / 打包套餐：调用方只有码、没有行，故本函数自己查。
 * 码形即类型，前缀判定与剥前缀都由 product-kind 统一提供。
 * 币种硬编码 CNY（两张表都没有币种列，原实现同样写死）。
 */
export async function resolveLearningProduct(
  planCode: string,
  findMaterial: (materialId: string) => Promise<MaterialPriceInput | null>,
): Promise<ProductResolution> {
  const kind = classifyProductCode(planCode);

  if (kind === PRODUCT_KIND.MATERIAL) {
    const material = await findMaterial(stripProductPrefix(planCode));
    if (!material) return missing("material_not_found");
    const product: ResolvedProduct = {
      kind,
      code: planCode,
      // 与原实现一致：中文名 → 英文名 → 原码
      name: material.title_zh || material.title_en || planCode,
      unitPrice: Number(material.price),
      priceRaw: String(material.price),
      currency: DEFAULT_CURRENCY,
      sellable: true,
      priceSource: "learning_material",
    };
    return { ok: true, product };
  }

  if (kind === PRODUCT_KIND.BUNDLE) {
    const bundle = findLearningBundle(stripProductPrefix(planCode));
    if (!bundle) return missing("bundle_not_found");
    const product: ResolvedProduct = {
      kind,
      code: planCode,
      name: bundle.labelZh,
      unitPrice: bundle.price,
      priceRaw: String(bundle.price),
      currency: DEFAULT_CURRENCY,
      sellable: true,
      priceSource: "learning_bundle",
    };
    return { ok: true, product };
  }

  return missing("invalid_kind");
}

/**
 * 培训课程：单价来自 training_courses.unit_price，入参为非空课程行
 * （调用方仍需整行取 course.id / scheduleId）。
 * ×人数、名额校验属订单层，不在此处。
 */
export function courseProductOf(course: CoursePriceInput): ResolvedProduct {
  return {
    kind: PRODUCT_KIND.COURSE,
    code: String(course.id),
    name: course.name_zh || "",
    unitPrice: Number(course.unit_price || 0),
    priceRaw: String(course.unit_price || 0),
    currency: course.currency || DEFAULT_CURRENCY,
    sellable: true,
    priceSource: "training_course",
  };
}
