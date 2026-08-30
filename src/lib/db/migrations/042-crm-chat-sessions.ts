/**
 * 042: CRM 数字人客服会话与消息表
 * 支持 AI 自助 → 人工接管的混合客服模式
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 42,
  name: "crm-chat-sessions",
  async up(dbPool: Pool) {
    // ── 客服会话表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_chat_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        customer_id VARCHAR(64) NOT NULL COMMENT '客户标识（用户 ID 或匿名 session）',
        customer_name VARCHAR(128) NULL COMMENT '客户名称',
        lead_id VARCHAR(64) NULL COMMENT '关联的 Lead ID（如有）',
        agent_id VARCHAR(64) NULL COMMENT '接管的运营经理用户 ID',
        agent_email VARCHAR(255) NULL COMMENT '运营经理邮箱',
        status ENUM('waiting','active','closed') NOT NULL DEFAULT 'waiting'
          COMMENT '会话状态: waiting=等待接入, active=已接入, closed=已关闭',
        mode ENUM('ai','human','hybrid') NOT NULL DEFAULT 'ai'
          COMMENT '当前模式: ai=AI自动, human=人工, hybrid=混合',
        ai_handled_count INT UNSIGNED NOT NULL DEFAULT 0
          COMMENT 'AI 自动回复次数',
        locale VARCHAR(8) NOT NULL DEFAULT 'en'
          COMMENT '客户语言偏好',
        ai_summary TEXT NULL COMMENT 'AI 生成的对话摘要（转人工时传递上下文）',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        accepted_at DATETIME NULL DEFAULT NULL COMMENT '人工接入时间',
        closed_at DATETIME NULL DEFAULT NULL COMMENT '会话关闭时间',
        last_message_at DATETIME NULL DEFAULT NULL COMMENT '最后消息时间',
        KEY idx_status (status),
        KEY idx_customer_id (customer_id),
        KEY idx_agent_id (agent_id),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── 客服消息表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_chat_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        session_id BIGINT UNSIGNED NOT NULL COMMENT '所属会话 ID',
        role ENUM('customer','ai','agent') NOT NULL
          COMMENT '消息角色: customer=客户, ai=AI助手, agent=运营经理',
        content TEXT NOT NULL COMMENT '消息正文',
        metadata JSON NULL COMMENT '扩展元数据（AI 意图、置信度等）',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_session_id (session_id),
        KEY idx_session_created (session_id, created_at),
        KEY idx_role (role),
        CONSTRAINT fk_chat_msg_session FOREIGN KEY (session_id)
          REFERENCES crm_chat_sessions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },
};
