/**
 * 迁移 013 · 旧 RFQ 域表归档（2026-11-14 用户拍板整体替换，零映射）
 *
 * @module server/db/migrations/013-retire-rfq-tables
 * @description rfq_demand v2 域被采购需求发布域（011/012）整体替换。生产 rfq_demand
 *              全 0 行、无任何真实业务数据，旧表 RENAME 归档（可回滚：把 z_retired_
 *              前缀改回即恢复）。v_rfq_review_queue 视图引用旧表，先删除。
 *              rfq_guard 不归档——主表防撞号哨兵与新域解耦，继续服务平台投影行。
 *              幂等：逐表探测存在性，存在才改名（本地/生产执行进度可能不同）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** 旧表 → 归档名（rfq_guard 有意不在清单） */
const RETIRE_PAIRS: Array<[string, string]> = [
  ["rfq_demand", "z_retired_rfq_demand"],
  ["rfq_demand_revision", "z_retired_rfq_demand_revision"],
  ["rfq_review_task", "z_retired_rfq_review_task"],
  ["rfq_demand_event", "z_retired_rfq_demand_event"],
  ["rfq_invitation", "z_retired_rfq_invitation"],
  ["rfq_quote", "z_retired_rfq_quote"],
  ["rfq_qa", "z_retired_rfq_qa"],
  ["rfq_award", "z_retired_rfq_award"],
  ["rfq_quotes", "z_retired_rfq_quotes"],
  ["rfq_invites", "z_retired_rfq_invites"],
  ["rfq_outreach", "z_retired_rfq_outreach"],
];

async function tableExists(dbPool: Pool, table: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table],
  );
  return Number((rows as RowDataPacket[])[0]?.n ?? 0) > 0;
}

export const migration: Migration = {
  version: 13,
  name: "retire_rfq_tables",
  async up(dbPool: Pool): Promise<void> {
    // 视图引用旧表，必须先删（010 建，生产已存在；IF EXISTS 幂等）
    await dbPool.query("DROP VIEW IF EXISTS `v_rfq_review_queue`");
    for (const [from, to] of RETIRE_PAIRS) {
      if (await tableExists(dbPool, from)) {
        // 目标名已存在（重复执行的异常残留）则跳过，保证幂等
        if (await tableExists(dbPool, to)) continue;
        await dbPool.query(`RENAME TABLE \`${from}\` TO \`${to}\``);
      }
    }
  },
};
