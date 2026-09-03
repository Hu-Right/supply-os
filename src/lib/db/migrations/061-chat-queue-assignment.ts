/**
 * 061: 客服排队/自动分配（P1）
 * chat-queue-assignment
 *
 * - crm_chat_sessions 新增 assigned_uid / assigned_at：自动分配的"指派目标"。
 *   会话保持 waiting 直到客服实际接入（acceptSession）；指派仅用于定向通知，
 *   超时未接（30s）由调度器改派，因此不设外键、可轮换。
 * - 新增 chat_agent_presence：客服在线状态（online/busy/away/offline），
 *   由 intelligence-daily 工作台写入，自动分配只派给 online 的客服；
 *   接待负载（active 会话数）实时计算，不落列，避免计数漂移。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndexIfTableExists, type Migration } from "./runner";

export const migration: Migration = {
  version: 61,
  name: "chat-queue-assignment",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_chat_sessions",
      "assigned_uid",
      "assigned_uid INT UNSIGNED NULL AFTER agent_email",
    );
    await ensureColumn(
      dbPool,
      "crm_chat_sessions",
      "assigned_at",
      "assigned_at DATETIME NULL AFTER assigned_uid",
    );
    await ensureIndexIfTableExists(
      dbPool,
      "crm_chat_sessions",
      "idx_assigned_uid",
      "ADD INDEX idx_assigned_uid (assigned_uid)",
    );

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS chat_agent_presence (
        agent_uid INT UNSIGNED NOT NULL PRIMARY KEY,
        agent_email VARCHAR(190) NOT NULL DEFAULT '',
        dept VARCHAR(50) NOT NULL DEFAULT 'sales',
        status ENUM('online','busy','away','offline') NOT NULL DEFAULT 'offline',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='客服在线状态（P1 自动分配）'
    `);
  },
};
