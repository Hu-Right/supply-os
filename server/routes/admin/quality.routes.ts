/**
 * 管理运维 — 质量监控路由
 * Admin quality monitoring routes
 *
 * @module server/routes/admin/quality.routes
 * @description 数据质量快照采集/查询、Schema 健康检查端点。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAdmin } from "./middleware";
import { captureDataQualitySnapshot } from "../../services/quality-monitor";

export function createAdminQualityRouter(ctx: AppContext): Router {
  const router = Router();
  const adminRepo = ctx.admin.adminRepo;

  // P1-2 安全修复：质量快照采集必须管理员鉴权
  router.post("/api/admin/quality-snapshot", requireAdmin, asyncHandler(async (_req, res) => {
      const metrics = await captureDataQualitySnapshot(ctx.dbPool);
      res.json({ success: true, metrics });
  }));

  // P1-2 安全修复：质量快照查询必须管理员鉴权
  router.get("/api/admin/quality-snapshot", requireAdmin, asyncHandler(async (req, res) => {
      const days = Math.min(Math.max(parseInt(String(req.query.days), 10) || 30, 1), 365);
      const snapshots = await adminRepo.listQualitySnapshots(days);
      res.json({ success: true, snapshots });
  }));

  // P1-2 安全修复：Schema 健康检查必须管理员鉴权
  router.get("/api/procurement/schema-status", requireAdmin, asyncHandler(async (_req, res) => {
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
        "crm_user_search_log",
        "crm_data_quality_snapshot",
        "crm_notice_amount_cache",
        "crm_user_reco_feedback",
        "crm_reco_weight_profile",
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
        crm_user_search_log: ["user_key", "q", "country", "filters", "result_cnt"],
        crm_data_quality_snapshot: ["snapshot_date", "total_notices", "missing_value", "missing_country", "missing_deadline", "unlinked_unspsc", "expired_but_active", "dup_notice_cnt"],
        crm_notice_amount_cache: ["notice_id", "amount", "currency", "amount_usd", "inferred", "parse_version", "parsed_at"],
        crm_user_reco_feedback: ["user_key", "notice_id", "action", "reco_score", "position", "variant", "session_id", "dwell_ms"],
        crm_reco_weight_profile: ["user_key", "w_unspsc", "w_agency", "w_amount", "w_geo", "w_urgency"],
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

  return router;
}
