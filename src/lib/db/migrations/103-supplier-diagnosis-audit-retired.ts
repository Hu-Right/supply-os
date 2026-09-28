/**
 * 103: 供应商诊断审核退役 —— 移除审核三列（audit_status / reject_reason / reviewed_at）
 *
 * 2026-09-28 诊断审核整体退役（后台查询页口径）：提交即生效，approve/reject 流转端点删除，
 * 三列不再有任何读写方。audit_status 的 DEFAULT 'pending' 还会持续给新行盖无效状态章，
 * 故从结构上移除，而非仅停用。
 *
 * 生产库已于同日以影子表方式完成换表（LIKE 建影子 → 去三列 → 平移 → RENAME 原子换），
 * 本迁移为幂等收口：先查 information_schema 再删，已换表的库直接登记版本号，
 * 未换表的其他环境（含全新回放 096 → 103）执行同样的结构收敛。
 * 审核三列的历史值保留在换表备份表 crm_supplier_diagnosis_bak_auditcols_20260928 与
 * v1 封存表 crm_supplier_qualification 中，sys_audit_logs 快照不受影响。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const DROP_COLUMNS = ["audit_status", "reject_reason", "reviewed_at"] as const;

export const migration: Migration = {
  version: 103,
  name: "supplier-diagnosis-audit-retired",
  async up(dbPool: Pool) {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_diagnosis'
         AND COLUMN_NAME IN ('audit_status', 'reject_reason', 'reviewed_at')`,
    );
    const present = new Set(rows.map((r) => String(r.name)));
    if (present.size === 0) {
      console.log("[migration-103] 审核三列已不存在（影子换表已完成），仅登记版本");
      return;
    }
    const drops = DROP_COLUMNS.filter((c) => present.has(c)).map((c) => `DROP COLUMN \`${c}\``).join(", ");
    await dbPool.query(`ALTER TABLE crm_supplier_diagnosis ${drops}`);
    console.log(`[migration-103] 已移除审核列: ${[...present].join(", ")}`);
  },
};
