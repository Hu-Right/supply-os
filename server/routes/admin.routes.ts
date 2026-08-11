/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { AppContext } from "../context";
import { asyncHandler } from "../middleware/errorHandler";
import { syncUnspscBridgeFull, captureDataQualitySnapshot } from "../services/quality";
import { backfillUnspscCodeIds } from "../db/backfills";
import { AMOUNT_PARSE_VERSION, backfillNoticeAmountCache, rollupNoticeViewDaily } from "../services/amount";
import { AB_TREATMENT_PCT } from "../services/recommend";
import { runRetryTranslation, countPendingRetries, isRetryRunning, getLastRetryResult } from "../services/retryTranslation";
import { hashPassword } from "../services/auth";
import { validatePassword } from "../../src/shared/auth/passwordPolicy";

// 管理员鉴权：校验 ADMIN_API_TOKEN（.env 配置）。支持两种携带方式：
//   x-admin-token: <token>  或  Authorization: Bearer <token>
// fail-closed：未配置令牌时拒绝所有请求（503），避免“忘配置 = 裸奔”；
// 比对用 timingSafeEqual 防时序侧信道猜解。
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!expected) {
    res.status(503).json({ success: false, message: "管理接口未启用：服务端未配置 ADMIN_API_TOKEN" });
    return;
  }
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const provided = String(req.headers["x-admin-token"] || bearer || "").trim();
  const expectedBuf = crypto.createHash("sha256").update(expected).digest();
  const providedBuf = crypto.createHash("sha256").update(provided).digest();
  if (!provided || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    res.status(401).json({ success: false, message: "管理接口鉴权失败：令牌缺失或无效" });
    return;
  }
  next();
}

export function createAdminRouter(ctx: AppContext): Router {
  const router = Router();
  const adminRepo = ctx.adminRepo;

  // 手动触发全量 bridge 回填（运维接口，幂等安全；需 ADMIN_API_TOKEN 鉴权，见 requireAdmin）
  router.post("/api/admin/sync-bridge", requireAdmin, async (_req, res) => {
    res.json({ success: true, message: "全量 bridge 回填已在后台启动，请查看服务日志获取进度" });
    // 响应先返回，回填在后台执行
    Promise.all([
      syncUnspscBridgeFull(ctx.dbPool, "notice"),
      syncUnspscBridgeFull(ctx.dbPool, "opportunity"),
    ]).then(() => backfillUnspscCodeIds(ctx.dbPool)).catch((err) => {
      console.warn("[BridgeSync] 手动触发全量回填失败:", err.message);
    });
  });

  // 本地差异 #8：C.3.5 质量快照运维接口（无定时器，手动触发；同日重跑覆盖当日快照）
  router.post("/api/admin/quality-snapshot", asyncHandler(async (_req, res) => {
      const metrics = await captureDataQualitySnapshot(ctx.dbPool);
      res.json({ success: true, metrics });
  }));

  // 本地差异 #8：查询近 N 天快照（观测趋势用，默认 30 天）
  router.get("/api/admin/quality-snapshot", asyncHandler(async (req, res) => {
      const days = Math.min(Math.max(parseInt(String(req.query.days), 10) || 30, 1), 365);
      const snapshots = await adminRepo.listQualitySnapshots(days);
      res.json({ success: true, snapshots });
  }));

  // 本地差异 #10：T-B3 金额缓存批量回填（手动触发，无定时器；每批 ≤2000 行短事务，可中断续跑）
  router.post("/api/admin/backfill-amounts", asyncHandler(async (req, res) => {
      const batches = Math.min(Math.max(parseInt(String(req.query.batches), 10) || 5, 1), 30);
      let processed = 0;
      for (let i = 0; i < batches; i++) {
        const result = await backfillNoticeAmountCache(ctx.dbPool);
        processed += result.processed;
        if (result.processed < 2000) break;
      }
      const remaining = await adminRepo.countAmountBackfillRemaining(AMOUNT_PARSE_VERSION);
      res.json({ success: true, processed, remaining });
  }));

  // 本地差异 #12：T-E2 手动触发浏览量日汇总（懒计算之外的运维入口，无定时器）
  router.post("/api/admin/rollup-views", asyncHandler(async (req, res) => {
      const sinceDays = Math.min(Math.max(parseInt(String(req.query.since_days), 10) || 0, 0), 365);
      const result = await rollupNoticeViewDaily(ctx.dbPool, sinceDays);
      const stats = await adminRepo.getViewRollupStats();
      res.json({ success: true, affected: result.affected, rows_total: stats.rows_total, latest_day: stats.latest_day });
  }));

  // ── 本地差异 #15：T-B10 A/B 指标端点（B.5）──
  // 按 variant 聚合反馈流水四指标（只读，admin 手动查询，无定时器）：
  // ctr = click 用户次数 / impression 次数；unlock_rate = unlock / impression；
  // dismiss_rate（忽略率）= dismiss / impression；avg_unlock_position = unlock 平均位次。
  // variant 为 NULL 的历史行（T-B10 前埋点）归入 'control' 口径统计
  router.get("/api/admin/reco-ab-metrics", asyncHandler(async (req, res) => {
      const sinceDays = Math.min(Math.max(parseInt(String(req.query.since_days), 10) || 30, 1), 365);
      const rows = await adminRepo.listRecoAbMetrics(sinceDays);
      res.json({
        since_days: sinceDays,
        treatment_pct: AB_TREATMENT_PCT,
        variants: rows,
      });
  }));

  router.get("/api/procurement/schema-status", asyncHandler(async (_req, res) => {
      const tables = [
        "crm_users",
        "ungm_1v1_appointments",
        "crm_membership_plans",
        "crm_user_subscriptions",
        "crm_payment_orders",
        "crm_payment_provider_configs",
        "crm_user_entitlements",
        "crm_opportunity_unlocks",
        "crm_user_notice_views",
        "crm_notice_interests",
        "crm_user_interest_codes",
        "crm_supplier_claims",
        "crm_supplier_translations",
        "crm_bid_notice_unspsc_codes",
        // 本地差异 #8：补入 G.4 搜索日志表（第一批漏登记）与 C.3.5 质量快照表
        "crm_user_search_log",
        "crm_data_quality_snapshot",
        // 本地差异 #10：T-B3 金额解析缓存表
        "crm_notice_amount_cache",
        // 本地差异 #11：T-B2 推荐反馈流水表 + 权重档案表
        "crm_user_reco_feedback",
        "crm_reco_weight_profile",
        // 本地差异 #12：T-E2 浏览量日汇总 rollup 表
        "crm_notice_view_daily"
      ];
      const existing = await adminRepo.listExistingTables(tables);
      const requiredColumns: Record<string, string[]> = {
        crm_users: ["user_key", "email", "display_name", "password_hash", "membership_tier", "supplier_id", "supplier_link_status"],
        ungm_1v1_appointments: ["appointment_key", "company_name", "contact_person", "contact_method", "consultation_needs", "status", "extra", "raw_payload"],
        crm_membership_plans: ["plan_code", "name", "price", "unlock_quota", "free_quota", "plan_type", "is_active"],
        crm_user_subscriptions: ["user_id", "user_key", "plan_code", "status", "started_at", "expires_at"],
        crm_payment_orders: ["user_id", "order_no", "user_key", "provider", "plan_code", "notice_id", "amount", "status", "pay_url", "raw_request", "raw_notify", "paid_at"],
        crm_payment_provider_configs: ["provider", "mode", "app_id", "merchant_id", "notify_url", "private_key_ref", "cert_ref", "is_active"],
        crm_user_entitlements: ["user_id", "user_key", "source_order_no", "plan_code", "quota_total", "quota_used", "expires_at", "status"],
        crm_opportunity_unlocks: ["user_key", "opportunity_id", "notice_id", "unlock_type", "price", "unspsc_codes_snapshot"],
        crm_user_notice_views: ["user_key", "opportunity_id", "notice_id", "viewed_at", "ip"],
        crm_notice_interests: ["user_id", "user_key", "notice_id", "interest_type", "source", "note"],
        crm_user_interest_codes: ["user_key", "code_id", "code", "level", "source", "weight"],
        crm_supplier_claims: ["user_id", "user_key", "supplier_id", "company_name", "supplier_type", "status"],
        crm_bid_notice_unspsc_codes: ["notice_id", "code_id", "code", "level", "level1_id", "level2_id", "level3_id", "level4_id", "level5_id"],
        // 本地差异 #8
        crm_user_search_log: ["user_key", "q", "country", "filters", "result_cnt"],
        crm_data_quality_snapshot: ["snapshot_date", "total_notices", "missing_value", "missing_country", "missing_deadline", "unlinked_unspsc", "expired_but_active", "dup_notice_cnt"],
        // 本地差异 #10
        crm_notice_amount_cache: ["notice_id", "amount", "currency", "amount_usd", "inferred", "parse_version", "parsed_at"],
        // 本地差异 #11
        crm_user_reco_feedback: ["user_key", "notice_id", "action", "reco_score", "position", "variant", "session_id", "dwell_ms"],
        crm_reco_weight_profile: ["user_key", "w_unspsc", "w_agency", "w_amount", "w_geo", "w_urgency"],
        // 本地差异 #12
        crm_notice_view_daily: ["notice_id", "stat_day", "view_cnt", "uniq_user_cnt"],
      };
      const columnsByTable = await adminRepo.listTableColumns(tables);
      const rowCounts: Record<string, number | null> = {};
      for (const table of tables) {
        if (!existing.has(table)) {
          rowCounts[table] = null;
          continue;
        }
        const rowCount = await adminRepo.countTableRows(table);
        rowCounts[table] = rowCount;
      }
      res.json({
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
  }));

  // ── 批量翻译重试（运维接口：重新翻译历史失败记录）──
  // POST 触发重试，GET 查询状态/诊断
  router.post("/api/admin/retry-translation", requireAdmin, asyncHandler(async (req, res) => {
    if (isRetryRunning()) {
      res.status(409).json({ success: false, message: "批量重试已在运行中，请等待完成" });
      return;
    }
    const maxPerScan = Math.min(Math.max(parseInt(String(req.query.max_per_scan), 10) || 500, 1), 5000);
    const includeExpired = String(req.query.include_expired ?? "true").toLowerCase() !== "false";
    const concurrency = Math.min(Math.max(parseInt(String(req.query.concurrency), 10) || 10, 1), 30);

    // 响应先返回（长时间运行），实际重试在后台执行
    res.json({
      success: true,
      message: "批量翻译重试已在后台启动，请通过 GET /api/admin/retry-translation 查看进度",
      options: { maxPerScan, includeExpired, concurrency },
    });

    try {
      await runRetryTranslation(ctx.dbPool, { maxPerScan, includeExpired, concurrency });
    } catch (err: any) {
      console.error("[retry-translate] 后台执行失败:", err?.message || err);
    }
  }));

  router.get("/api/admin/retry-translation", requireAdmin, asyncHandler(async (_req, res) => {
    const running = isRetryRunning();
    const lastResult = getLastRetryResult();
    // 诊断：统计各表/语言待重试数量
    const diagnosis = await countPendingRetries(ctx.dbPool);
    res.json({
      success: true,
      running,
      last_result: lastResult,
      diagnosis,
    });
  }));

  // ── 管理员人工通道：帮用户重置密码 ──────────────────────────────────────────
  // 用于邮箱虚假/不可达的老用户无法收到验证码时，管理员手动重置密码
  router.post("/api/admin/users/:userKey/reset-password", requireAdmin, asyncHandler(async (req, res) => {
    const userKey = String(req.params.userKey || "").trim().toLowerCase();
    const newPassword = String(req.body.new_password || "");

    if (!userKey) {
      res.status(400).json({ success: false, message: "缺少 userKey 参数" });
      return;
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ success: false, message: pwCheck.message });
      return;
    }

    // 检查用户是否存在
    const user = await ctx.usersRepo.findByKey(userKey);
    if (!user) {
      res.status(404).json({ success: false, message: "用户不存在" });
      return;
    }

    // 重置密码（使用 bcrypt）
    const newHash = await hashPassword(newPassword);
    await ctx.usersRepo.updatePassword(userKey, newHash, "bcrypt");

    res.json({
      success: true,
      message: `用户 ${userKey} 的密码已重置`,
      user_key: userKey,
    });
  }));

  // ── 管理员人工通道：帮用户更换邮箱 ──────────────────────────────────────────
  // 用于邮箱虚假/不可达的老用户，管理员手动更换为真实邮箱
  router.post("/api/admin/users/:userKey/reset-email", requireAdmin, asyncHandler(async (req, res) => {
    const userKey = String(req.params.userKey || "").trim().toLowerCase();
    const newEmail = String(req.body.new_email || "").trim().toLowerCase();

    if (!userKey) {
      res.status(400).json({ success: false, message: "缺少 userKey 参数" });
      return;
    }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      res.status(400).json({ success: false, message: "请输入有效的邮箱地址" });
      return;
    }

    // 检查用户是否存在
    const user = await ctx.usersRepo.findByKey(userKey);
    if (!user) {
      res.status(404).json({ success: false, message: "用户不存在" });
      return;
    }

    // 检查新邮箱是否已被占用
    const existingUser = await ctx.usersRepo.findByKey(newEmail);
    if (existingUser) {
      res.status(409).json({ success: false, message: "该邮箱已被其他用户使用" });
      return;
    }

    // 更新邮箱（同时更新 user_key，因为 user_key 就是小写邮箱）
    await ctx.dbPool.execute(
      "UPDATE crm_users SET user_key = ?, email = ?, email_verified = 0, updated_at = NOW() WHERE user_key = ?",
      [newEmail, newEmail, userKey],
    );

    res.json({
      success: true,
      message: `用户邮箱已从 ${userKey} 更换为 ${newEmail}`,
      old_email: userKey,
      new_email: newEmail,
    });
  }));

  // ── 管理员查询：邮件发送记录 ──────────────────────────────────────────
  // 用于排查邮件发送失败问题
  router.get("/api/admin/email-logs", requireAdmin, asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 200);
    const failedOnly = String(req.query.failed_only ?? "false").toLowerCase() === "true";

    let sql = `
      SELECT id, user_key, code, expires_at, used, attempts, email_sent, email_error, ip, created_at
      FROM crm_password_resets
    `;
    if (failedOnly) {
      sql += " WHERE email_sent = 0 AND email_error IS NOT NULL";
    }
    sql += " ORDER BY created_at DESC LIMIT ?";

    const [rows] = await ctx.dbPool.query(sql, [limit]);

    res.json({
      success: true,
      count: (rows as any[]).length,
      logs: rows,
    });
  }));

  return router;
}
