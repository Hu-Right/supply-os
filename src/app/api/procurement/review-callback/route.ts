/**
 * POST /api/procurement/review-callback — 评审后台回写核验结论（服务间 HMAC）
 *
 * @module app/api/procurement/review-callback/route
 * @description 七步流程第 6 步入口：approved → 双闸（授权 verified + 采购主体 verified）
 *              → published + 搜索投影 + tender + 守护登记（同事务）；rejected → need_info
 *              （理由≥10 字）。回调指纹幂等；版本冲突 409，绝不覆盖用户改稿。
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
  EC_RFQ_AUTHORIZATION_REQUIRED,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_REASON_REQUIRED,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_VERSION_CONFLICT,
} from "@/shared/constants/api";
import { verifyCallbackRequest } from "@/lib/services/rfq/callback-auth";
import { applyReviewDecision } from "@/lib/services/procurement/tender";

export const POST = withRoute(async (req: NextRequest) => {
  const secret = process.env.RFQ_REVIEW_CALLBACK_SECRET || "";
  if (!secret) routeError(503, EC_INTERNAL_ERROR, "审核回调未配置密钥");

  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 120 },
    () => `procurement-review-callback:${extractClientIp(req)}`,
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
  const projectId = Number(body.projectId ?? 0);
  const version = Number(body.version ?? 0);
  const decision = String(body.decision ?? "") === "approved" ? "approved" : "rejected";
  const reason = body.reason == null ? null : String(body.reason);
  const reviewerRef = body.reviewerRef == null ? null : String(body.reviewerRef);
  const callbackId = String(req.headers.get("x-review-request-id") || "").slice(0, 64);
  if (!Number.isFinite(projectId) || projectId <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 projectId");
  if (!Number.isFinite(version) || version <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 version");
  if (!callbackId) routeError(400, EC_INVALID_PARAMS, "缺少 X-Review-Request-Id");

  try {
    const result = await applyReviewDecision(getPool(), {
      projectId,
      version,
      decision,
      reason,
      reviewerRef,
      callbackId,
      at: nowSec,
    });
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
          break;
        case "version_conflict":
          routeError(409, EC_RFQ_VERSION_CONFLICT, "版本已变化（用户已改稿），请刷新队列后重试");
          break;
        case "reason_required":
          routeError(400, EC_RFQ_REASON_REQUIRED, "退回必须填写不少于 10 字的理由");
          break;
        case "authorization_required":
          routeError(403, EC_RFQ_AUTHORIZATION_REQUIRED, "授权书未签署或未通过核验，不能发布（按需求编号+版本绑定）");
          break;
        case "buyer_not_verified":
          routeError(403, EC_RFQ_AUTHORIZATION_REQUIRED, "采购主体尚未通过身份认证，不能正式发布");
          break;
        default:
          routeError(409, EC_RFQ_STATE_INVALID, "当前状态不接受该审核结论");
      }
    }
    /** 核验结论视图 */
    const reviewDecisionViewOf = (r: Extract<typeof result, { ok: true }>) => ({
      status: r.status,
      version: r.version,
      ...(r.tenderNo ? { tenderNo: r.tenderNo } : {}),
    });
    return NextResponse.json(reviewDecisionViewOf(result));
  } catch (err) {
    console.warn("[api/procurement/review-callback] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "核验结论回写失败，请稍后重试");
  }
});
