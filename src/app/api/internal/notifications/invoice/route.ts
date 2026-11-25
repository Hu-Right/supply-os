/**
 * POST /api/internal/notifications/invoice — 后台开票结果通知门户用户（服务间 HMAC）
 *
 * @module app/api/internal/notifications/invoice/route
 * @description 后台（intelligence-daily）开具/驳回/红冲发票后回调本接口，由门户统一
 *              给用户发站内信 + 邮件。共享密钥 HMAC-SHA256，签名内容 `${timestamp}.${rawBody}`，
 *              时间戳容差 ±300s；通知失败只记日志，不影响后台开票结果。
 */
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { verifyCallbackRequest } from "@/lib/services/procurement/callback-auth";
import { dispatchNotification } from "@/lib/services/notifications/dispatch";

type InvoiceEvent = "issued" | "rejected";

export const POST = withRoute(async (req: NextRequest) => {
  const secret = process.env.NOTIFICATION_CALLBACK_SECRET || "";
  if (!secret) routeError(503, EC_INTERNAL_ERROR, "通知回调未配置密钥");

  const rawBody = await req.text();
  const nowSec = Math.floor(Date.now() / 1000);
  const auth = verifyCallbackRequest({
    secret,
    timestamp: Number(req.headers.get("x-notify-timestamp") || 0),
    signature: req.headers.get("x-notify-signature") || "",
    rawBody,
    nowSec,
  });
  if (!auth.ok) routeError(403, EC_FORBIDDEN, `通知回调签名校验失败（${auth.reason}）`);

  let body: { requestId?: number; event?: string; invoiceNo?: string; reason?: string };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }
  const requestId = Number(body.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的申请单 ID");
  const event = body.event as InvoiceEvent | undefined;
  if (event !== "issued" && event !== "rejected") routeError(400, EC_INVALID_PARAMS, "无效的通知事件");

  const pool = getPool();
  const [rows] = await pool.query<(RowDataPacket & { user_id: number; amount: string | number; invoice_no: string | null })[]>( 
    "SELECT user_id, amount, invoice_no FROM invoice_requests WHERE id = ? LIMIT 1",
    [requestId],
  );
  const row = rows[0];
  if (!row) routeError(404, EC_NOT_FOUND, "发票申请不存在");

  const data = {
    requestId,
    amount: row.amount,
    invoiceNo: body.invoiceNo ?? row.invoice_no ?? null,
    reason: body.reason ?? null,
  };
  void dispatchNotification(pool, {
    userId: Number(row.user_id),
    event: event === "issued" ? "billing.invoice.issued" : "billing.invoice.rejected",
    data,
    dedupeKey: `invoice.${event}:${requestId}`,
  }).catch((err) => console.warn("[invoice-notify] 分发失败:", (err as Error).message));

  return NextResponse.json({ success: true });
});

