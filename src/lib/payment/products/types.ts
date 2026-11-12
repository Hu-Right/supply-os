/**
 * 商品定价解析 — 类型契约
 * Product pricing resolution — contract
 *
 * @module lib/payment/products/types
 * @description 「一处定义商品价格长什么样」。四个下单服务不再各自组装
 *              name / price / currency，而是统一拿这个结构。
 *
 *   **为什么保留 priceRaw**：目录里的金额是 decimal 字符串（如 "199.00"），
 *   落库快照必须原样保留两位小数 —— `String(Number("199.00"))` 会变成 "199"，
 *   财务对账与既有测试都按原字符串断言。计算用 unitPrice，落库用 priceRaw。
 *
 *   **为什么不在本层做校验**：四个业务的错误码各不相同
 *   （PLAN_NOT_SELLABLE / SERVICE_UNAVAILABLE / MATERIAL_NOT_FOUND / COURSE_PRICE_INVALID），
 *   一旦在这一层合并，调用方就得反推原因、错误码契约会漂。
 *   所以这里只给事实（sellable / advisoryOnly），判定与抛错留在调用方。
 */
import type { ProductKind } from "@/shared/constants/product-kind";

/** 定价来源：排障时一眼看出这个价是从哪张目录读的 */
export type ProductPriceSource =
  | "plan_catalog"
  | "service_catalog"
  | "learning_material"
  | "learning_bundle"
  | "training_course";

export interface ResolvedProduct {
  kind: ProductKind;
  /** 原始商品码（material_/bundle_/svc_ 前缀原样保留；培训为课程 id 字符串） */
  code: string;
  /** 展示名（渠道下单时的商品描述、订单行标题） */
  name: string;
  /** 单价（数值，供计算；不含 ×人数、不含升级差价） */
  unitPrice: number;
  /** 单价原串（目录 decimal 口径，落库快照用，勿过 Number 再回 String） */
  priceRaw: string;
  currency: string;
  /**
   * 是否可售：在售 + 定价方式支持自助下单。
   * ⚠ 不含「单价 > 0」—— 该条各业务错误码不同（AMOUNT_INVALID / INVALID_AMOUNT /
   * COURSE_PRICE_INVALID），留在调用方判。
   */
  sellable: boolean;
  /** 增值服务限定：sale_mode !== "self" 或 price_from=1（N 元起）不得自助收款 */
  advisoryOnly?: boolean;
  /** 增值服务落库快照：orders.items_snapshot.saleMode */
  saleMode?: string;
  priceSource: ProductPriceSource;
}

/**
 * 查不到的原因。按业务细分，调用方直接映射成各自的历史错误码，不做二次推断。
 *
 * 注意：只有「调用方手里没有目录行」的路径（学习类，按码查）才用它表达 not-found；
 * 会员/服务/培训三条路径调用方自己先查行、自己抛 not-found（PLAN_NOT_FOUND /
 * SERVICE_UNAVAILABLE / COURSE_NOT_FOUND），故不在此枚举里重复一遍。
 */
export type ProductUnavailableReason =
  | "material_not_found"
  | "bundle_not_found"
  | "invalid_kind";

export type ProductResolution =
  | { ok: true; product: ResolvedProduct }
  | { ok: false; reason: ProductUnavailableReason };
