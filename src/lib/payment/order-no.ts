/**
 * 业务单号生成的唯一入口
 *
 * @module lib/payment/order-no
 * @description 此前 SO/SV/LE/TR 四种前缀的单号在各业务服务里各有一个逐字相同的
 *              私有 makeOrderNo，只差前缀字面量——前缀与 product_kind 的对应关系
 *              靠四处自觉维持，新增商品类型时漏一处就静默错路由（回调按前缀分发）。
 *              收敛为单点工厂：前缀映射见 shared/constants/product-kind.ORDER_NO_PREFIX。
 *
 *   格式 = 前缀 + yyyyMMdd（本地日期）+ 16 位随机 hex 大写，与既有单号逐字兼容。
 */
import crypto from "crypto";
import { ORDER_NO_PREFIX, type ProductKind } from "../../shared/constants/product-kind";

export function nextOrderNo(kind: ProductKind): string {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${ORDER_NO_PREFIX[kind]}${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}
