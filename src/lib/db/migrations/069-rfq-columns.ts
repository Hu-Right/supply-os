/**
 * 069: crm_bid_notices 增加 RFQ 平台发布所需列
 * rfq-columns
 *
 * 新增列：
 * - rfq_status     VARCHAR(20)  RFQ 状态（draft/published/closed），仅 notice_type='RFQ' 时使用
 * - contact_email  VARCHAR(200) 采购方联系邮箱
 * - contact_phone  VARCHAR(50)  采购方联系电话
 * - user_id        BIGINT       创建者用户 ID（平台发布时写入）
 * - entry_source   VARCHAR(20)  数据来源（crawl=爬虫, platform=平台用户, api=外部导入）
 * - province_name  VARCHAR(50)  交付省份（RFQ 国内用）
 * - category_l1_id INT          UNSPSC 一级分类 ID
 * - category_l2_id INT          UNSPSC 二级分类 ID
 *
 * 配套：RFQ 表单提交接入后端（方案一）
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 69,
  name: "rfq-columns",
  async up(dbPool: Pool) {
    // RFQ 状态
    await ensureColumn(
      dbPool, "crm_bid_notices", "rfq_status",
      "rfq_status VARCHAR(20) NULL COMMENT 'RFQ状态: draft/published/closed' AFTER `published_date`",
    );

    // 采购方联系方式
    await ensureColumn(
      dbPool, "crm_bid_notices", "contact_email",
      "contact_email VARCHAR(200) NULL COMMENT '采购方联系邮箱' AFTER `rfq_status`",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "contact_phone",
      "contact_phone VARCHAR(50) NULL COMMENT '采购方联系电话' AFTER `contact_email`",
    );

    // 创建者用户 ID
    await ensureColumn(
      dbPool, "crm_bid_notices", "user_id",
      "user_id BIGINT UNSIGNED NULL COMMENT '创建者用户ID（平台发布）' AFTER `contact_phone`",
    );

    // 数据来源标记
    await ensureColumn(
      dbPool, "crm_bid_notices", "entry_source",
      "entry_source VARCHAR(20) NOT NULL DEFAULT 'crawl' COMMENT '数据来源: crawl/platform/api' AFTER `user_id`",
    );

    // 交付省份
    await ensureColumn(
      dbPool, "crm_bid_notices", "province_name",
      "province_name VARCHAR(50) NULL COMMENT '交付省份（RFQ国内用）' AFTER `entry_source`",
    );

    // UNSPSC 分类
    await ensureColumn(
      dbPool, "crm_bid_notices", "category_l1_id",
      "category_l1_id INT UNSIGNED NULL COMMENT 'UNSPSC一级分类ID（RFQ用）' AFTER `province_name`",
    );
    await ensureColumn(
      dbPool, "crm_bid_notices", "category_l2_id",
      "category_l2_id INT UNSIGNED NULL COMMENT 'UNSPSC二级分类ID（RFQ用）' AFTER `category_l1_id`",
    );

    // 索引：RFQ 广场查询需要按 entry_source + notice_type 过滤
    await ensureIndex(
      dbPool, "crm_bid_notices", "idx_entry_source",
      "CREATE INDEX idx_entry_source ON crm_bid_notices (entry_source, notice_type)",
    );
    await ensureIndex(
      dbPool, "crm_bid_notices", "idx_user_id",
      "CREATE INDEX idx_bid_notices_user_id ON crm_bid_notices (user_id)",
    );

    console.log("[migration-069] crm_bid_notices RFQ 列已就绪");
  },
};
