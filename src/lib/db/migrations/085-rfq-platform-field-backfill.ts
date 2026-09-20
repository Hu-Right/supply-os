/**
 * 085: 平台 RFQ 存量数据修复（公告编号 / 发布时间 / 创建时间）
 * rfq-platform-field-backfill
 *
 * 背景（三个字段问题的存量修复，增量逻辑已在 api/rfq/create、submit 同步更正）：
 * 1. 旧版 create 不写 reference/notice_id → 平台 RFQ 编号全 NULL，列表/详情/宽表无法追溯。
 *    统一回填 RFQ-{id 9 位补零}（reference 与 notice_id 同值，id 唯一保证两者唯一）。
 * 2. 旧版 create 在创建时（draft/pending_review 阶段）就把 published_date 写成 CURDATE()，
 *    语义实为创建日。对 create_time 为 NULL 的行，把该值迁移为 create_time（epoch 秒），
 *    再把非 published 状态的 published_date 清空，避免未发布记录误显"发布于"。
 *    已 published 的行保留 published_date（无法回溯真实审核时点，维持现值）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 85,
  name: "rfq-platform-field-backfill",
  async up(dbPool: Pool) {
    // ① 编号回填（仅平台 RFQ 且 reference 为空者）
    // 注意用 12 位补零：当前 id 已达 10 位，LPAD 宽度不足会静默截断→撞 notice_id 唯一键
    const [refRes] = await dbPool.query(
      `UPDATE crm_bid_notices
       SET reference = CONCAT('RFQ-', LPAD(id, 12, '0')),
           notice_id = CONCAT('RFQ-', LPAD(id, 12, '0'))
       WHERE entry_source = 'platform' AND notice_type = 'RFQ'
         AND (reference IS NULL OR reference = '')`,
    );
    // mysql2 对 UPDATE 返回 ResultSetHeader
    const refChanged = Number((refRes as { affectedRows?: number }).affectedRows ?? 0);

    // ② 旧版误写在创建期的 published_date → 迁移为 create_time（仅当 create_time 缺失）
    await dbPool.query(
      `UPDATE crm_bid_notices
       SET create_time = UNIX_TIMESTAMP(STR_TO_DATE(published_date, '%Y-%m-%d')) + 86399
       WHERE entry_source = 'platform' AND notice_type = 'RFQ'
         AND create_time IS NULL
         AND published_date IS NOT NULL AND published_date <> ''
         AND STR_TO_DATE(LEFT(published_date, 10), '%Y-%m-%d') IS NOT NULL`,
    );

    // ③ 非 published 状态清空 published_date（真实发布时点由审核动作写入）
    const [pdRes] = await dbPool.query(
      `UPDATE crm_bid_notices
       SET published_date = NULL
       WHERE entry_source = 'platform' AND notice_type = 'RFQ'
         AND IFNULL(rfq_status, '') <> 'published'
         AND published_date IS NOT NULL`,
    );
    const pdCleared = Number((pdRes as { affectedRows?: number }).affectedRows ?? 0);

    console.log(
      `[migration-085] 平台 RFQ 回填完成：编号 ${refChanged} 条，` +
        `未发布记录清空 published_date ${pdCleared} 条`,
    );
  },
};
