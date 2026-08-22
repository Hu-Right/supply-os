/**
 * 038: 研修班学员信息表
 * training_participants
 *
 * @description 支付完成后记录每个学员的详细信息，支持：
 *              - 生成学员名单、签到表、证书
 *              - 按订单查询学员明细
 *              - 学员与订单的多对一关系
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 38,
  name: "training-participants",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_participants (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        order_id        BIGINT UNSIGNED NOT NULL COMMENT '关联 training_orders.id',
        participant_no  INT UNSIGNED NOT NULL COMMENT '学员序号（1-based，用于排序）',
        
        -- 学员基本信息（精简版）
        full_name       VARCHAR(200) NOT NULL COMMENT '学员姓名',
        gender          VARCHAR(20) NULL COMMENT '性别（male/female/other）',
        phone           VARCHAR(50) NULL COMMENT '电话',
        company_name    VARCHAR(255) NULL COMMENT '公司名称',
        position        VARCHAR(100) NULL COMMENT '职位',
        
        -- 元数据
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        
        -- 索引
        INDEX idx_participants_order (order_id, participant_no),
        INDEX idx_participants_phone (phone),
        
        -- 外键（可选，如果 training_orders 存在）
        CONSTRAINT fk_participants_order FOREIGN KEY (order_id) 
          REFERENCES training_orders (id) 
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log("[migration-038] training_participants 表创建完成");
  },
};
