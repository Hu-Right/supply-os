/**
 * POST /api/rfq/review-claim — 评审后台领取工单
 *
 * @module app/api/rfq/review-claim/route
 * @description 可选动作：把工单从 queued 置 claimed，并把需求从 submitted 推到 under_review，
 *              让采购方看到"审核中"而不是一直"等待领取"，同时把 SLA 拆成排队时长与处理时长。
 *              与 review-callback 同一套鉴权（HMAC + 时间戳）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import {
  EC_INVALID_PARAMS,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_VERSION_CONFLICT,
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
} from "@/shared/constants/api";
import { verifyCallbackRequest } from "@/lib/services/rfq/callback-auth";
import { claimReviewTask } from "@/lib/services/rfq/review";

export const POST = withRoute(async (req: NextRequest) => {
  const secret = process.env.RFQ_REVIEW_CALLBACK_SECRET || "";
  if (!secret) routeError(503, EC_INTERNAL_ERROR, "审核回调未配置密钥");

  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 120 },
    () => `rfq-review-claim:${extractClientIp(req)}`,
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

  const demandId = Number(body.demandId);
  const version = Number(body.version);
  const claimedBy = String(body.claimedBy || "").slice(0, 64);
  if (!Number.isFinite(demandId) || demandId <= 0) routeError(400, EC_INVALID_PARAMS, "demandId 非法");
  if (!Number.isFinite(version) || version <= 0) routeError(400, EC_INVALID_PARAMS, "version 非法");
  if (!claimedBy) routeError(400, EC_INVALID_PARAMS, "缺少 claimedBy");

  const result = await claimReviewTask(getPool(), { demandId, version, claimedBy, at: nowSec });
  if (!result.ok) {
    if (result.reason === "version_conflict") {
      routeError(409, EC_RFQ_VERSION_CONFLICT, "版本已变化，请刷新队列");
    }
    routeError(409, EC_RFQ_STATE_INVALID, "工单不存在或已被领取/结案");
  }

  return NextResponse.json({ status: result.status, version: result.version });
});
