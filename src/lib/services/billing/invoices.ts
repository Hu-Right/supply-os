/**
 * 发票申请业务编排
 *
 * @module lib/services/billing/invoices
 * @description 创建申请时“服务端重算金额 + 防重复开票”，不信任前端金额；
 *              财务处理（接单/开具/作废/红冲）由 ops 路由调用 repo。
 */
import type { Pool } from "mysql2/promise";
import type { CreateInvoiceRequestInput, InvoiceRequestView } from "@/types/billing";
import {
  createInvoiceRequest,
  findActiveInvoiceConflicts,
  findInvoiceRequestById,
  listPaidOrdersByNos,
} from "@/lib/repos/invoice-requests";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { RouteError } from "@/lib/middleware/route-handler";

/** 用户提交开票申请：仅已支付订单、金额以订单实付为准、同一订单不可重复申请 */
export async function createInvoiceForUser(
  pool: Pool,
  userId: number,
  input: CreateInvoiceRequestInput,
): Promise<InvoiceRequestView> {
  const orderNos = [...new Set(input.orderNos.map((s) => s.trim()).filter(Boolean))];
  if (orderNos.length === 0 || orderNos.length > 20) {
    throw new RouteError(400, EC_INVALID_PARAMS, "请选择 1-20 笔可开票订单");
  }

  const paidOrders = await listPaidOrdersByNos(pool, userId, orderNos);
  if (paidOrders.length !== orderNos.length) {
    throw new RouteError(400, EC_INVALID_PARAMS, "存在未支付或不属于当前账号的订单，无法开票");
  }

  const conflicts = await findActiveInvoiceConflicts(pool, userId, orderNos);
  if (conflicts.length > 0) {
    throw new RouteError(400, EC_INVALID_PARAMS, "所选订单已提交过开票申请（待开票/开票中/已开具），请勿重复申请");
  }

  // 金额以订单实付为准（含税），不使用前端传入值
  const amount = Number(paidOrders.reduce((sum, o) => sum + o.amount, 0).toFixed(2));
  if (!(amount > 0)) {
    throw new RouteError(400, EC_INVALID_PARAMS, "可开票金额必须大于 0");
  }

  const buyerType = input.buyerType === "personal" ? "personal" : "enterprise";
  if (buyerType === "personal" && input.invoiceType === "special") {
    throw new RouteError(400, EC_INVALID_PARAMS, "个人抬头仅支持电子普通发票");
  }
  if (buyerType === "enterprise" && input.invoiceType === "special") {
    const missing = [
      !input.taxNo?.trim() && "税号",
      !input.addressPhone?.trim() && "注册地址",
      !input.phone?.trim() && "联系电话",
      !input.bankName?.trim() && "开户行",
      !input.bankAccount?.trim() && "银行账号",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new RouteError(400, EC_INVALID_PARAMS, `增值税专用发票缺少：${missing.join("、")}`);
    }
  }

  return createInvoiceRequest(pool, userId, {
    ...input,
    orderNos,
    amount,
    buyerType,
    invoiceType: buyerType === "personal" ? "normal" : input.invoiceType,
  });
}

/** 取发票申请单并做归属/权限校验 */
export async function getInvoiceRequestForViewer(
  pool: Pool,
  requestId: number,
  viewerUserId: number,
): Promise<InvoiceRequestView> {
  const row = await findInvoiceRequestById(pool, requestId);
  if (!row) throw new RouteError(404, EC_NOT_FOUND, "发票申请单不存在");
  if (row.userId !== viewerUserId) {
    throw new RouteError(403, EC_FORBIDDEN, "无权查看该发票");
  }
  return row;
}




