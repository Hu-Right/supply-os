/**
 * POST /api/procurement/review-claim — 评审后台领取核验（服务间 HMAC）
 *
 * @module app/api/procurement/review-claim/route
 * @description 领取 = submitted → under_review（状态机 system 角色）。共享密钥
 *              HMAC+时间戳（±300s）+ 恒定时间比较；队列读 v_procurement_review_queue。
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
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_VERSION_CONFLICT,
} from "@/shared/constants/api";
import { verifyCallbackRequest } from "@/lib/services/procurement/callback-auth";
import { transitionProject } from "@/lib/services/procurement/lifecycle";
import { PROJECT_STATUS } from "@/shared/constants/procurement";

export const POST = withRoute(async (req: NextRequest) => {
  const secret = process.env.RFQ_REVIEW_CALLBACK_SECRET || "";
  if (!secret) routeError(503, EC_INTERNAL_ERROR, "审核回调未配置密钥");

  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 120 },
    () => `procurement-review-claim:${extractClientIp(req)}`,
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
  const claimedBy = String(body.claimedBy ?? "").trim();
  if (!Number.isFinite(projectId) || projectId <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 projectId");
  if (!Number.isFinite(version) || version <= 0) routeError(400, EC_INVALID_PARAMS, "缺少 version");
  if (!claimedBy) routeError(400, EC_INVALID_PARAMS, "缺少 claimedBy");

  try {
    const result = await transitionProject(getPool(), {
      projectId,
      to: PROJECT_STATUS.UNDER_REVIEW,
      actor: "system",
      actorId: null,
      expectVersion: version,
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
        default:
          routeError(409, EC_RFQ_STATE_INVALID, "当前状态不可领取");
      }
    }
    /** 领取结果视图 */
    const reviewClaimedViewOf = (status: string, v: number) => ({ status, version: v });
    return NextResponse.json(reviewClaimedViewOf(result.status, result.versionNo));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/review-claim] failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "领取失败，请稍后重试");
  }
});
