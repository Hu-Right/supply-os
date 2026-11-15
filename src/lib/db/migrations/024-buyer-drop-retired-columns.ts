/**
 * 迁移 024 · 物理删除采购主体已下线字段
 *
 * @module server/db/migrations/024-buyer-drop-retired-columns
 * @description 022 只把表单收敛到 12 项，列刻意留着等"确认后台查询集合后再清理"。
 *              本轮确认完毕：这些列在门户侧只被 API 入参、视图出参与类型声明引用，
 *              改掉这三处引用后即可 DROP，不存在业务读路径。
 *
 *              删除的 11 列（全部来自 022 下线清单）：
 *                org_type / address / deliver_country / deliver_city /
 *                fund_source / budget_status / procurement_experience /
 *                leader_name / leader_title / leader_phone / leader_email
 *
 *              **必须同批修视图**：`v_procurement_review_queue` 是站外评审后台的只读入口，
 *              原定义里 `b.org_type AS buyer_org_type` 直接引用本表列。先重建视图再 DROP，
 *              否则 DROP 之后该视图查询会以 1356（引用失效列）失败。
 *              重建后视图**不再提供 buyer_org_type**——数据源已不存在，留 NULL 会让后台
 *              静默拿到空值；直接少一列，后台 SELECT 会立刻以 Unknown column 报错并暴露出来，
 *              比悄无声息的数据退化好定位。
 *
 *              回滚（DDL 不可逆，需要时手工执行）：
 *                ALTER TABLE procurement_buyers
 *                  ADD COLUMN org_type varchar(32) NOT NULL DEFAULT 'private',
 *                  ADD COLUMN address varchar(500) DEFAULT NULL,
 *                  ADD COLUMN deliver_country varchar(80) DEFAULT NULL,
 *                  ADD COLUMN deliver_city varchar(120) DEFAULT NULL,
 *                  ADD COLUMN fund_source varchar(32) DEFAULT NULL,
 *                  ADD COLUMN budget_status varchar(32) DEFAULT NULL,
 *                  ADD COLUMN procurement_experience varchar(500) DEFAULT NULL,
 *                  ADD COLUMN leader_name varchar(120) DEFAULT NULL,
 *                  ADD COLUMN leader_title varchar(120) DEFAULT NULL,
 *                  ADD COLUMN leader_phone varchar(50) DEFAULT NULL,
 *                  ADD COLUMN leader_email varchar(200) DEFAULT NULL;
 *                数据本身不回滚（DROP 即丢弃），需要历史值只能从备份取。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** 022 下线清单，现予物理删除 */
const RETIRED_COLUMNS = [
  "org_type",
  "address",
  "deliver_country",
  "deliver_city",
  "fund_source",
  "budget_status",
  "procurement_experience",
  "leader_name",
  "leader_title",
  "leader_phone",
  "leader_email",
] as const;

/**
 * 评审队列视图（与 012 同定义，去掉 b.org_type 投影）。
 * 其余列与 012 完全一致，避免顺手改动站外后台的契约。
 */
const REVIEW_QUEUE_VIEW =
  "CREATE OR REPLACE VIEW `v_procurement_review_queue` AS " +
  "SELECT p.`id` AS `project_id`, p.`reference` AS `reference`, p.`version_no` AS `version`, " +
  "p.`title_zh` AS `title`, p.`primary_ugt_code` AS `primary_ugt_code`, " +
  "p.`budget_amount` AS `budget_amount`, p.`budget_currency` AS `budget_currency`, " +
  "p.`budget_public` AS `budget_public`, p.`purpose` AS `purpose`, " +
  "p.`delivery_country` AS `delivery_country`, p.`delivery_city` AS `delivery_city`, " +
  "b.`org_name` AS `buyer_org_name`, b.`status` AS `buyer_status`, " +
  "p.`requirement_verify` AS `requirement_verify`, p.`fund_verify` AS `fund_verify`, " +
  "p.`submitted_at` AS `submitted_at`, " +
  "TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(p.`submitted_at`), NOW()) AS `waiting_minutes`, " +
  "a.`status` AS `auth_status`, a.`signer_name` AS `auth_signer_name`, " +
  "a.`signed_at` AS `auth_signed_at`, a.`scan_file_key` AS `auth_scan_file_key`, " +
  "a.`scan_file_hash` AS `auth_scan_file_hash` " +
  "FROM `procurement_projects` p " +
  "JOIN `procurement_buyers` b ON b.`id` = p.`buyer_id` " +
  "LEFT JOIN (SELECT project_id, version_no, MAX(id) AS latest_id " +
  "           FROM procurement_authorizations GROUP BY project_id, version_no) la " +
  "       ON la.project_id = p.id AND la.version_no = p.version_no " +
  "LEFT JOIN procurement_authorizations a ON a.id = la.latest_id " +
  "WHERE p.`status` IN ('submitted', 'under_review')";

export const migration: Migration = {
  version: 24,
  name: "buyer_drop_retired_columns",
  async up(dbPool: Pool): Promise<void> {
    // ① 先修视图，避免它持有对即将删除列的引用
    await dbPool.query(REVIEW_QUEUE_VIEW);

    // ② 逐列删除；已不存在则跳过（手工执行过或重跑时幂等）
    for (const col of RETIRED_COLUMNS) {
      const [rows] = await dbPool.query(
        "SELECT 1 FROM information_schema.COLUMNS " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procurement_buyers' AND COLUMN_NAME = ? LIMIT 1",
        [col],
      );
      if ((rows as RowDataPacket[]).length === 0) continue;
      await dbPool.query(`ALTER TABLE \`procurement_buyers\` DROP COLUMN \`${col}\``);
    }

    // ③ 表注释记录现状，避免后人看到"少列"又加回去
    await dbPool.query(
      "ALTER TABLE `procurement_buyers` COMMENT = " +
        "'采购方主体（F01）：身份与采购权限认证，verified 为正式发布前置。" +
        "2026-11-15 迁移 024 已物理删除表单下线列：org_type/address/deliver_country/deliver_city/" +
        "fund_source/budget_status/procurement_experience/leader_name/leader_title/leader_phone/leader_email" +
        "（负责人已并入 auth_contact_*，历史值由 022 回填）'",
    );
  },
};
