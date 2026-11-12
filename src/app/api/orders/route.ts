/**
 * POST /api/orders — 统一下单入口
 *
 * @module app/api/orders/route
 * @description 一份契约覆盖四类自助商品（会员套餐 / 增值服务 / 学习资料 / 打包套餐）：
 *              `{ product_kind, product_code }` 显式指明买什么，不再靠 `plan_code`
 *              的字符串前缀让服务端猜。翻译与执行都复用
 *              `lib/payment/orders/create-order`，与旧入口 `/api/payment/orders` 同一实现。
 *
 *              为什么只做 POST：本入口解决的是「下单」这一环；订单列表（GET）仍留在
 *              `/api/payment/orders`，等订单表合并（orders + order_items）时一并迁过来，
 *              免得把当前的四表内存归并分页又复制出一个 URL。
 *
 *              培训课为什么不在这里：它没有商品码，下单需要期次、人数、联系人与名额校验，
 *              契约形状与四类自助商品不同，仍走 `/api/training/orders`。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import {
  createOrder,
  orderViewOf,
  translateProductRequest,
} from "@/lib/payment/orders/create-order";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "";

  let input: Record<string, unknown>;
  try {
    input = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const translated = translateProductRequest(input);
  if (!translated.ok) {
    routeError(400, EC_INVALID_PARAMS, translated.message);
  }

  const outcome = await createOrder(auth.userId, translated.body, clientIp);
  if (!outcome.ok) routeError(outcome.status, outcome.code, outcome.message);

  return NextResponse.json(await orderViewOf(outcome.result, outcome.paymentMode), { status: 201 });
});
