/**
 * 迁移 014 · 采购需求发布域——F01/F02 主链修复
 *
 * @module server/db/migrations/014-procurement-publish-chain
 * @description 补齐「审核通过 → 发布」与「主体确认 → 授权」两条链上缺失的结构：
 *              ① procurement_projects.notice_pk —— tender/projection 发布时回写投影行 id，
 *                 撤回/到期时据此清理；此前代码已引用该列但迁移未建，审核通过必抛
 *                 ER_BAD_FIELD_ERROR（发布链路整体不可用）。
 *              ② procurement_buyers 的 F01 补齐字段 —— 代理采购授权文件（全案 F01 第 7 项）
 *                 与授权联系人（第 13 项）。此前这两项连列都没有，无法采集/留痕。
 *              DDL 幂等（ensureColumn/ensureIndex 均先查 information_schema）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 14,
  name: "procurement_publish_chain",
  async up(dbPool: Pool): Promise<void> {
    // ① 发布投影回写列（发布/撤回/到期三处代码已引用）
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "notice_pk",
      "notice_pk bigint unsigned DEFAULT NULL COMMENT '搜索投影行 bid_notices.id；发布时写入，撤回/到期置 NULL'",
    );
    await ensureIndex(
      dbPool,
      "procurement_projects",
      "idx_proj_notice_pk",
      "ALTER TABLE procurement_projects ADD KEY idx_proj_notice_pk (notice_pk)",
    );

    // ② F01 采购授权：代理采购授权文件 + 授权联系人（全案 F01 第 7、13 项）
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "agent_auth_file_key",
      "agent_auth_file_key varchar(255) DEFAULT NULL COMMENT '代理采购授权文件（upload_files 文件名，F01 第7项）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "agent_auth_file_hash",
      "agent_auth_file_hash char(64) DEFAULT NULL COMMENT '授权文件 sha256（版本/防篡改）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "auth_contact_name",
      "auth_contact_name varchar(120) DEFAULT NULL COMMENT '授权联系人姓名（谁可发布/修改/确认结果，F01 第13项）'",
    );
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "auth_contact_phone",
      "auth_contact_phone varchar(50) DEFAULT NULL COMMENT '授权联系人电话'",
    );
    await ensureColumn(
      dbPool,
      "procurement_buyers",
      "auth_contact_email",
      "auth_contact_email varchar(200) DEFAULT NULL COMMENT '授权联系人邮箱'",
    );
  },
};
