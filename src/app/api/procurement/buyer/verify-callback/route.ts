/**
 * POST /api/procurement/buyer/verify-callback — 站外核验后台回写主体核验结论（F05）
 *
 * @module app/api/procurement/buyer/verify-callback/route
 * @description 服务间 HMAC 接口（与 review-callback 同一密钥/签名口径）：领取不在门户，
 *              后台直读 procurement_buyers / procurement_buyer_verifications；本端点只接
 *              受结论写回——插入核验留痕 + 回写主体状态快照（pass→verified /
 *              need_info→need_info / reject→restricted）。回调幂等键 X-Review-Request-Id。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import {
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
} from "@/shared/constants/api";
import { verifyCallbackRequest } from "@/lib/services/procurement/callback-auth";
import {
  BUYER_VERIFY_KIND,
  recordBuyerVerification,
  type BuyerVerifyKind,
} from "@/lib/services/procurement/buyers";

const KINDS = new Set<string>(Object.values(BUYER_VERIFY_KIND));
const RESULTS = new Set(["pass", "need_info", "reject"]);

export const POST = withRoute(async (req: NextRequest) => {
  const secret = process.env.RFQ_REVIEW_CALLBACK_SECRET || "";
  if (!secret) routeError(503, EC_INTERNAL_ERROR, "核验回调未配置密钥");

  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 120 },
    () => `procurement-buyer-verify:${extractClientIp(req)}`,
  );
  if (rl) return rl;

  const rawBody = await req.text();
  const nowSec = Math.floor(Date.now() / 1000);
  const auth = verifyCallbackRequest({
    secret,
    timestamp: Number(req.headers.get("x-review-timestamp") || 0),
    signature: req.headers.get("x-review-signature") || "",
    rawBody,
    nowSec,
  });
  if (!auth.ok) routeError(403, EC_FORBIDDEN, `回调签名校验失败（${auth.reason}）`);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }
  const buyerId = Number(body.buyerId ?? 0);
  const kind = String(body.kind ?? "");
  const result = String(body.result ?? "");
  const reviewer = String(body.reviewer ?? "").trim();
  const callbackId = String(req.headers.get("x-review-request-id") || "").slice(0, 64);
  if (!Number.isFinite(buyerId) || buyerId <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 buyerId");
  if (!KINDS.has(kind)) routeError(400, EC_INVALID_PARAMS, "kind 必须是 identity/authorization/fund");
  if (!RESULTS.has(result)) routeError(400, EC_INVALID_PARAMS, "result 必须是 pass/need_info/reject");
  if (!reviewer) routeError(400, EC_INVALID_PARAMS, "缺少 reviewer");
  if (!callbackId) routeError(400, EC_INVALID_PARAMS, "缺少 X-Review-Request-Id");

  try {
    const r = await recordBuyerVerification(getPool(), {
      buyerId,
      kind: kind as BuyerVerifyKind,
      result: result as "pass" | "need_info" | "reject",
      reviewer,
      note: body.note == null ? null : String(body.note),
      evidenceFileKey: body.evidenceFileKey == null ? null : String(body.evidenceFileKey),
      evidenceHash: body.evidenceHash == null ? null : String(body.evidenceHash),
      callbackId,
      at: nowSec,
    });
    if (!r.ok) {
      if (r.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "采购主体不存在");
      routeError(400, EC_INVALID_PARAMS, "核验参数不完整");
    }
    /** 核验结论视图 */
    const buyerVerifyViewOf = (status: string, verificationId: number, duplicate?: boolean) => ({
      status,
      verificationId,
      ...(duplicate ? { duplicate: true } : {}),
    });
    return NextResponse.json(buyerVerifyViewOf(r.status, r.verificationId, r.duplicate));
  } catch (err) {
    console.warn("[api/procurement/buyer/verify-callback] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "核验结论回写失败，请稍后重试");
  }
});
