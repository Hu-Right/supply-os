/**
 * POST /api/procurement/authorization-callback — 授权书核验结论回写（服务间 HMAC）
 *
 * @module app/api/procurement/authorization-callback/route
 * @description 七步流程第 6 步的另一半：授权书核验原先是"站外评审后台直写库"的 ADR 例外，
 *              门户既无端点也无法通知，采购方签完字只能反复刷新发布页。现收口为回调：
 *              结论落库 + 站内通知（含驳回原因摘要）一次完成，后台审核类事件统一可见。
 *              幂等按 `X-Review-Request-Id`（procurement_authorizations.callback_id 唯一键）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import {
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
  EC_INVALID_PARAMS,
  EC_NOT_FOUND,
  EC_RFQ_REASON_REQUIRED,
} from "@/shared/constants/api";
import { verifyCallbackRequest } from "@/lib/services/procurement/callback-auth";
import { applyAuthorizationVerification } from "@/lib/services/procurement/authorization";

export const POST = withRoute(async (req: NextRequest) => {
  // 专用密钥优先；未配时回落审核回调密钥（便于先在单密钥环境跑通），两者皆空则拒绝服务
  const secret = process.env.RFQ_AUTH_CALLBACK_SECRET || process.env.RFQ_REVIEW_CALLBACK_SECRET || "";
  if (!secret) routeError(503, EC_INTERNAL_ERROR, "授权核验回调未配置密钥");

  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 120 },
    () => `procurement-auth-callback:${extractClientIp(req)}`,
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
  const versionNo = Number(body.version ?? body.versionNo ?? 0);
  // 严格枚举：拼写错误直接 400，不静默落到 rejected
  const raw = String(body.decision ?? "").trim().toLowerCase();
  if (raw !== "approved" && raw !== "rejected") {
    routeError(400, EC_INVALID_PARAMS, "decision 必须是 approved 或 rejected");
  }
  const rejectReason = body.rejectReason == null ? null : String(body.rejectReason);
  const reviewerRef = body.reviewerRef == null ? null : String(body.reviewerRef);
  const callbackId = String(req.headers.get("x-review-request-id") || "").slice(0, 64);

  if (!Number.isFinite(projectId) || projectId <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 projectId");
  if (!Number.isFinite(versionNo) || versionNo <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 version");
  if (!callbackId) routeError(400, EC_INVALID_PARAMS, "缺少 X-Review-Request-Id");

  try {
    const result = await applyAuthorizationVerification(getPool(), {
      projectId,
      versionNo,
      decision: raw === "approved" ? "verified" : "rejected",
      rejectReason,
      reviewerRef,
      callbackId,
      at: nowSec,
    });
    if (!result.ok) {
      if (result.reason === "not_found") routeError(404, EC_NOT_FOUND, "该需求与版本没有授权书记录");
      routeError(400, EC_RFQ_REASON_REQUIRED, "驳回必须填写不少于 10 字的理由");
    }
    return NextResponse.json({ status: result.status, duplicate: result.duplicate === true });
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/authorization-callback] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "授权核验结论回写失败，请稍后重试");
  }
});
