/**
 * POST /api/rfq/review-callback — 评审后台回写审核结论
 *
 * @module app/api/rfq/review-callback/route
 * @description 服务间接口（非管理后台）：共享密钥 HMAC + 时间戳 + 幂等键。
 *              门户是 `rfq_demand.status` 的唯一写入者；本路由只是把"审核结论"翻译成一次
 *              受校验的状态转移，版本不匹配即 409，绝不覆盖用户改稿。
 *
 *              返回：200 {status, version}；409 版本/状态冲突；401 签名失败；400 参数非法。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import {
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_VERSION_CONFLICT,
  EC_RFQ_REASON_REQUIRED,
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
} from "@/shared/constants/api";
import { REVIEW_DECISION, type ReviewDecision } from "@/shared/constants/rfq-demand";
import { verifyCallbackRequest } from "@/lib/services/rfq/callback-auth";
import { applyReviewDecision } from "@/lib/services/rfq/review";

export const POST = withRoute(async (req: NextRequest) => {
  const secret = process.env.RFQ_REVIEW_CALLBACK_SECRET || "";
  if (!secret) {
    // 未配置密钥时明确拒绝，而不是静默放行（回调是唯一的状态写入口）
    routeError(503, EC_INTERNAL_ERROR, "审核回调未配置密钥");
  }

  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 120 },
    () => `rfq-review-callback:${extractClientIp(req)}`,
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
  if (!auth.ok) {
    routeError(403, EC_FORBIDDEN, `回调签名校验失败（${auth.reason}）`);
  }

  const callbackId = String(req.headers.get("x-review-request-id") || "").slice(0, 64);
  if (!callbackId) routeError(400, EC_INVALID_PARAMS, "缺少 X-Review-Request-Id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const demandId = Number(body.demandId);
  const version = Number(body.version);
  const decision = String(body.decision || "");
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "demandId 非法");
  }
  if (!Number.isFinite(version) || version <= 0) {
    routeError(400, EC_INVALID_PARAMS, "version 非法");
  }
  if (decision !== REVIEW_DECISION.APPROVED && decision !== REVIEW_DECISION.REJECTED) {
    routeError(400, EC_INVALID_PARAMS, "decision 必须是 approved 或 rejected");
  }

  const result = await applyReviewDecision(getPool(), {
    demandId,
    version,
    decision: decision as ReviewDecision,
    reason: body.reason == null ? null : String(body.reason),
    reviewerRef: body.reviewerRef == null ? null : String(body.reviewerRef).slice(0, 64),
    callbackId,
    at: nowSec,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
        break;
      case "version_conflict":
        routeError(409, EC_RFQ_VERSION_CONFLICT, "版本已变化（用户已改稿），请刷新队列后重试");
        break;
      case "reason_required":
        routeError(400, EC_RFQ_REASON_REQUIRED, "退回必须填写不少于 10 字的理由");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不接受该审核结论");
    }
  }

  return NextResponse.json({ status: result.status, version: result.version });
});
