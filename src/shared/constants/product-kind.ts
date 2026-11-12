/**
 * 订单商品类型常量与判定
 * Order Product Kind — single classification point
 *
 * @module shared/constants/product-kind
 * @description 全库唯一的「这是什么商品」判定口。
 *
 *   **为什么收这一处**：此前这个判断散在 7 个地方、各写一遍字符串前缀 ——
 *   下单路由的分派（route.ts）、会员/学习两个 createOrder、学习单履约与查询、
 *   支付弹窗的「是否要选行业大类」、我的记录的行标题。后果是：
 *   新增一种商品要逐处改，漏一处就静默掉分支（未知前缀一律落进会员分支，
 *   最后报 PLAN_NOT_FOUND，排查方向直接被带偏）。
 *
 *   **码形约定（与各目录表一致，本模块不改写任何码）**：
 *   - 会员套餐 `plan_catalog.plan_code`：无前缀，如 `business` / `unlimited`
 *   - 增值服务 `service_catalog.service_code`：**码自带 `svc_` 前缀**，
 *     如 `svc_ai_tender_analysis`。⚠ `svc_` 是 SKU 码本身的一部分，
 *     判类型时不得剥掉，剥了就查不到目录行（与 material_/bundle_ 相反）
 *   - 学习资料 `material_*`、打包套餐 `bundle_*`：前缀是命名空间，
 *     目录主键要剥前缀后才是 `learning_materials.material_id` / bundle id
 *   - 培训课程：真实下单走 `course_id + schedule_id`，没有商品码；
 *     `training_course_*` 是订单列表归一化时**拼出来的展示码**
 *     （见 `payment/orchestrator.listAllOrders`），仅存在于读路径
 */

export const PRODUCT_KIND = {
  /** 会员套餐（含升级） */
  PLAN: "plan",
  /** 增值服务 SKU */
  SERVICE: "service",
  /** 学习资料（单份） */
  MATERIAL: "material",
  /** 学习资料打包套餐 */
  BUNDLE: "bundle",
  /** 培训课程（读路径展示码，无真实 SKU） */
  COURSE: "course",
} as const;

export type ProductKind = (typeof PRODUCT_KIND)[keyof typeof PRODUCT_KIND];

/**
 * 商品类型 → 订单号前缀（SO=会员通道 / SV=服务 / LE=学习（资料·套餐）/ TR=培训）。
 * 支付回调单入口按前缀路由业务分支（orchestrator.handleNotify → getOrderBusiness），
 * 前缀与 kind 必须一一对应；生成统一走 lib/payment/order-no.ts 的 nextOrderNo，
 * 不要在业务服务里再手拼前缀。
 */
export const ORDER_NO_PREFIX: Record<ProductKind, string> = {
  [PRODUCT_KIND.PLAN]: "SO",
  [PRODUCT_KIND.SERVICE]: "SV",
  [PRODUCT_KIND.MATERIAL]: "LE",
  [PRODUCT_KIND.BUNDLE]: "LE",
  [PRODUCT_KIND.COURSE]: "TR",
};

/**
 * 前缀 → 类型。顺序即匹配顺序，长前缀在前。
 * `training_course_` 排在后面无影响（与其他前缀无包含关系），但保留显式条目，
 * 避免读路径的展示码被当成会员档。
 */
const CODE_PREFIXES: ReadonlyArray<readonly [string, ProductKind]> = [
  ["material_", PRODUCT_KIND.MATERIAL],
  ["bundle_", PRODUCT_KIND.BUNDLE],
  ["svc_", PRODUCT_KIND.SERVICE],
  ["training_course_", PRODUCT_KIND.COURSE],
];

/**
 * 由商品码判定类型。未知前缀与空串一律归 `plan`（会员档），
 * 由目录层判存不存在（`PLAN_NOT_FOUND`）——与历史上「else 即会员」的行为逐字一致，
 * 不在判定层静默吞掉一个打错的码。
 */
export function classifyProductCode(code: unknown): ProductKind {
  const raw = String(code ?? "").trim();
  for (const [prefix, kind] of CODE_PREFIXES) {
    if (raw.startsWith(prefix)) return kind;
  }
  return PRODUCT_KIND.PLAN;
}

/**
 * 剥掉命名空间前缀，得到目录表主键。
 * 只有 `material_` / `bundle_` 是命名空间前缀；`svc_` 属于码本身，
 * 会员档无前缀 —— 两者原样返回。
 */
export function stripProductPrefix(code: unknown): string {
  const raw = String(code ?? "").trim();
  if (raw.startsWith("material_")) return raw.slice("material_".length);
  if (raw.startsWith("bundle_")) return raw.slice("bundle_".length);
  return raw;
}
