/**
 * POST /api/supplier-diagnosis/guide-event — 诊断引导卡事件埋点
 *
 * @module app/api/supplier-diagnosis/guide-event/route
 * @description 右下角诊断引导卡的 impression/click/dismiss 事件；登录态 + 用户维度限流。
 *              只用于运营观测，不参与业务判定；失败不影响前端展示。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import {
  SupplierDiagnosisGuideEventRepo,
  type DiagnosisGuideEvent,
} from "@/lib/repos/supplier-diagnosis-guide-event.repo";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR } from "@/shared/constants/api";

const ALLOWED_EVENTS = new Set<DiagnosisGuideEvent>(["impression", "click", "dismiss"]);

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `diag-guide:${auth.userId}`);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const event = String(body.event ?? "").trim() as DiagnosisGuideEvent;
  if (!ALLOWED_EVENTS.has(event)) {
    routeError(400, EC_INVALID_PARAMS, "event 必须是 impression/click/dismiss");
  }

  const rawSupplierId = Number(body.supplier_id ?? body.supplierId ?? 0);
  const supplierId = Number.isFinite(rawSupplierId) && rawSupplierId > 0 ? Math.trunc(rawSupplierId) : null;
  const path = typeof body.path === "string" ? body.path.trim().slice(0, 200) || null : null;

  try {
    await new SupplierDiagnosisGuideEventRepo(getPool()).record({
      userId: auth.userId,
      supplierId,
      event,
      path,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[supplier-diagnosis guide-event POST]", err);
    routeError(500, EC_INTERNAL_ERROR, "埋点写入失败");
  }
});
