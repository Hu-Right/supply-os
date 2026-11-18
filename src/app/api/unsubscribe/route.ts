/**
 * POST /api/unsubscribe —— 邮件退订确认
 *
 * 入参 { token }（HMAC 签名邮箱），校验通过后：
 *   1) 幂等写 email_unsubscribe（唯一键 email+tenant_id）；
 *   2) 回写该邮箱历史 outreach_items.unsubscribed_at（旧看板/导出立即生效）。
 * 只接受 POST：退订页先展示确认按钮，避免邮件网关预取 GET 链接时误退订。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { verifyUnsubToken } from "@/lib/services/unsubscribe/token";

const bodySchema = z.object({
  token: z.string().min(10).max(4096),
});

export const POST = withRoute(async (req: NextRequest) => {
  const body = await parseJson(req, bodySchema);
  const payload = verifyUnsubToken(body.token);
  if (!payload) routeError(400, EC_INVALID_PARAMS, "退订链接无效或已损坏");

  const { email, tenantId } = payload;
  const pool = getContext().dbPool;
  const now = Math.floor(Date.now() / 1000);

  await pool.query(
    `INSERT INTO email_unsubscribe (email, reason, source_task_id, unsubscribe_at, tenant_id)
     VALUES (?, 'unsubscribe_link', NULL, ?, ?)
     ON DUPLICATE KEY UPDATE reason=VALUES(reason), unsubscribe_at=VALUES(unsubscribe_at)`,
    [email, now, tenantId],
  );
  await pool.query(
    `UPDATE outreach_items SET unsubscribed_at = NOW()
      WHERE lower(trim(email)) = ? AND unsubscribed_at IS NULL`,
    [email],
  );

  return NextResponse.json({ success: true, email });
});