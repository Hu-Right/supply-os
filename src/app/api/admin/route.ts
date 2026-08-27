/**
 * 管理运维路由
 * Admin routes
 *
 * @module app/api/admin/route
 * @description 从 Express routes/admin/ 迁移。
 *              包含数据操作、质量监控、翻译重试、用户管理、指标查询等功能。
 *              所有端点均需管理员权限验证。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { checkAdmin } from "@/lib/middleware/admin";
import { hashPassword } from "@/lib/services/auth";
import { validatePassword } from "@/lib/utils/passwordPolicy";

// ── 错误码定义 ─
const ApiErrorCode = {
  ADMIN_AUTH_REQUIRED: 40301,
  INVALID_PARAMS: 40008,
  USER_NOT_FOUND: 40011,
  INVALID_PASSWORD: 40012,
  INVALID_EMAIL: 40013,
  EMAIL_ALREADY_USED: 40901,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json(
    { code, message, error: message },
    { status },
  );
}

// ─ GET 端点 ──
export async function GET(req: NextRequest) {
  const adminCheck = checkAdmin(req);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const ctx = getContext();
  const adminRepo = ctx.admin.adminRepo;
  const authRepo = ctx.user.authRepo;

  // GET /api/admin/quality-snapshot — 质量快照查询
  if (url.pathname.endsWith("/quality-snapshot")) {
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30"), 1), 365);
    const snapshots = await adminRepo.listQualitySnapshots(days);
    return NextResponse.json({ success: true, snapshots });
  }

  // GET /api/procurement/schema-status — Schema 健康检查
  if (url.pathname.endsWith("/schema-status")) {
    const tables = [
      "crm_users", "ungm_1v1_appointments", "crm_membership_plans",
      "crm_user_subscriptions", "crm_payment_orders", "crm_payment_provider_configs",
      "crm_user_entitlements", "crm_opportunity_unlocks", "crm_user_notice_views",
      "crm_notice_interests", "crm_user_interest_codes", "crm_supplier_claims",
      "crm_supplier_translations", "crm_bid_notice_unspsc_codes", "crm_user_search_log",
      "crm_data_quality_snapshot", "crm_notice_amount_cache", "crm_user_reco_feedback",
      "crm_reco_weight_profile", "crm_notice_view_daily",
    ];
    const existing = await adminRepo.listExistingTables(tables);
    const requiredColumns: Record<string, string[]> = {
      crm_users: ["user_key", "email", "display_name", "password_hash", "membership_tier", "supplier_id", "supplier_link_status"],
      crm_membership_plans: ["plan_code", "name", "price", "unlock_quota", "free_quota", "plan_type", "is_active"],
      crm_payment_orders: ["user_id", "order_no", "user_key", "provider", "plan_code", "notice_id", "amount", "status", "pay_url", "raw_request", "raw_notify", "paid_at"],
    };
    const columnsByTable = await adminRepo.listTableColumns(tables);
    const rowCounts: Record<string, number | null> = {};
    for (const table of tables) {
      if (!existing.has(table)) {
        rowCounts[table] = null;
        continue;
      }
      rowCounts[table] = await adminRepo.countTableRows(table);
    }
    return NextResponse.json({
      success: true,
      tables: tables.map((table) => {
        const columns = columnsByTable.get(table) || new Set<string>();
        const required = requiredColumns[table] || [];
        return {
          table,
          exists: existing.has(table),
          row_count: rowCounts[table],
          column_count: columns.size,
          missing_columns: required.filter((column) => !columns.has(column)),
        };
      }),
    });
  }

  // GET /api/admin/retry-translation — 查询翻译重试状态
  if (url.pathname.endsWith("/retry-translation")) {
    const { isRetryRunning, getLastRetryResult, countPendingRetries } = await import("@/lib/services/translation/retry");
    const running = isRetryRunning();
    const lastResult = getLastRetryResult();
    const diagnosis = await countPendingRetries(ctx.dbPool);
    return NextResponse.json({ success: true, running, last_result: lastResult, diagnosis });
  }

  // GET /api/admin/email-logs — 邮件发送记录
  if (url.pathname.endsWith("/email-logs")) {
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
    const failedOnly = url.searchParams.get("failed_only")?.toLowerCase() === "true";
    const rows = await authRepo.listPasswordResets({ failedOnly, limit });
    return NextResponse.json({ success: true, count: rows.length, logs: rows });
  }

  // GET /api/admin/reco-ab-metrics — A/B 推荐指标
  if (url.pathname.endsWith("/reco-ab-metrics")) {
    const { AB_TREATMENT_PCT } = await import("@/lib/services/recommend/index");
    const sinceDays = Math.min(Math.max(parseInt(url.searchParams.get("since_days") || "30"), 1), 365);
    const rows = await adminRepo.listRecoAbMetrics(sinceDays);
    return NextResponse.json({ since_days: sinceDays, treatment_pct: AB_TREATMENT_PCT, variants: rows });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

// ── POST 端点 ──
export async function POST(req: NextRequest) {
  const adminCheck = checkAdmin(req);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const ctx = getContext();
  const adminRepo = ctx.admin.adminRepo;
  const usersRepo = ctx.user.usersRepo;
  const dbPool = ctx.dbPool;

  // POST /api/admin/sync-bridge — 全量 bridge 回填
  if (url.pathname.endsWith("/sync-bridge")) {
    const { syncUnspscBridgeFull } = await import("@/lib/services/bridge-sync");
    const { backfillUnspscCodeIds } = await import("@/lib/db/backfills");
    // 响应先返回，回填在后台执行
    Promise.all([
      syncUnspscBridgeFull(dbPool, "notice"),
      syncUnspscBridgeFull(dbPool, "opportunity"),
    ]).then(() => backfillUnspscCodeIds(dbPool)).catch((err) => {
      console.warn("[BridgeSync] 手动触发全量回填失败:", err.message);
    });
    return NextResponse.json({ success: true, message: "全量 bridge 回填已在后台启动" });
  }

  // POST /api/admin/backfill-amounts — 金额回填
  if (url.pathname.endsWith("/backfill-amounts")) {
    const { AMOUNT_PARSE_VERSION, backfillNoticeAmountCache } = await import("@/lib/services/amount/index");
    const batches = Math.min(Math.max(parseInt(url.searchParams.get("batches") || "5"), 1), 30);
    let processed = 0;
    for (let i = 0; i < batches; i++) {
      const result = await backfillNoticeAmountCache(dbPool);
      processed += result.processed;
      if (result.processed < 2000) break;
    }
    const remaining = await adminRepo.countAmountBackfillRemaining(AMOUNT_PARSE_VERSION);
    return NextResponse.json({ success: true, processed, remaining });
  }

  // POST /api/admin/rollup-views — 浏览量日汇总
  if (url.pathname.endsWith("/rollup-views")) {
    const { rollupNoticeViewDaily } = await import("@/lib/services/amount/index");
    const sinceDays = Math.min(Math.max(parseInt(url.searchParams.get("since_days") || "0"), 0), 365);
    const result = await rollupNoticeViewDaily(dbPool, sinceDays);
    const stats = await adminRepo.getViewRollupStats();
    return NextResponse.json({ success: true, affected: result.affected, rows_total: stats.rows_total, latest_day: stats.latest_day });
  }

  // POST /api/admin/quality-snapshot — 质量快照采集
  if (url.pathname.endsWith("/quality-snapshot")) {
    const { captureDataQualitySnapshot } = await import("@/lib/services/quality-monitor");
    const metrics = await captureDataQualitySnapshot(dbPool);
    return NextResponse.json({ success: true, metrics });
  }

  // POST /api/admin/retry-translation — 批量翻译重试
  if (url.pathname.endsWith("/retry-translation")) {
    const { runRetryTranslation, isRetryRunning } = await import("@/lib/services/translation/retry");
    if (isRetryRunning()) {
      return NextResponse.json({ success: false, message: "批量重试已在运行中" }, { status: 409 });
    }
    const maxPerScan = Math.min(Math.max(parseInt(url.searchParams.get("max_per_scan") || "500"), 1), 5000);
    const includeExpired = url.searchParams.get("include_expired")?.toLowerCase() !== "false";
    const concurrency = Math.min(Math.max(parseInt(url.searchParams.get("concurrency") || "10"), 1), 30);
    const dailyCharBudget = Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000);

    // 响应先返回，实际重试在后台执行
    const response = NextResponse.json({
      success: true,
      message: "批量翻译重试已在后台启动",
      options: { maxPerScan, includeExpired, concurrency, dailyCharBudget },
    });

    // 后台执行重试
    void (async () => {
      try {
        const retryResult = await runRetryTranslation(dbPool, { maxPerScan, includeExpired, concurrency, dailyCharBudget });
        console.log(`[admin-retry] 批量重试完成: 扫描=${retryResult.scanned} 成功=${retryResult.ok} 失败=${retryResult.failed}`);
      } catch (err) {
        console.error("[admin-retry] 后台执行失败:", err);
      }
    })();

    return response;
  }

  // POST /api/admin/users/:userKey/reset-password — 重置密码
  const resetPasswordMatch = url.pathname.match(/\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (resetPasswordMatch) {
    const userKey = resetPasswordMatch[1].trim().toLowerCase();
    const body = await req.json();
    const newPassword = String(body.new_password || "");

    if (!userKey) return sendError("缺少 userKey 参数", 400, ApiErrorCode.INVALID_PARAMS);
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) return sendError(pwCheck.message, 400, ApiErrorCode.INVALID_PASSWORD);

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError("用户不存在", 404, ApiErrorCode.USER_NOT_FOUND);

    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(userKey, newHash, "bcrypt");
    return NextResponse.json({ success: true, message: `用户 ${userKey} 的密码已重置`, user_key: userKey });
  }

  // POST /api/admin/users/:userKey/reset-email — 更换邮箱
  const resetEmailMatch = url.pathname.match(/\/api\/admin\/users\/([^/]+)\/reset-email$/);
  if (resetEmailMatch) {
    const userKey = resetEmailMatch[1].trim().toLowerCase();
    const body = await req.json();
    const newEmail = String(body.new_email || "").trim().toLowerCase();

    if (!userKey) return sendError("缺少 userKey 参数", 400, ApiErrorCode.INVALID_PARAMS);
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return sendError("请输入有效的邮箱地址", 400, ApiErrorCode.INVALID_EMAIL);
    }

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError("用户不存在", 404, ApiErrorCode.USER_NOT_FOUND);

    const existingUser = await usersRepo.findByKey(newEmail);
    if (existingUser) return sendError("该邮箱已被其他用户使用", 409, ApiErrorCode.EMAIL_ALREADY_USED);

    await usersRepo.updateUserEmail(userKey, newEmail);
    return NextResponse.json({ success: true, message: `用户邮箱已更换为 ${newEmail}`, old_email: userKey, new_email: newEmail });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
