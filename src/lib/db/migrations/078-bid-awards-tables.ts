/**
 * 078: 中标记录表 + 中标商信息表
 * bid-awards-tables
 *
 * 用于存储从联合国采购（UNICEF/UNGM）、国际公共采购平台、国内政府采购网
 * 爬取的中标（Contract Award）数据。与 crm_bid_notices（招标公告）平行，
 * 通过 source_notice_id 可关联回原始招标。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 78,
  name: "bid-awards-tables",
  async up(dbPool: Pool) {
    // ── 中标记录主表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_bid_awards (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

        -- 来源标识
        source_platform VARCHAR(30)   NOT NULL DEFAULT 'unicef'
                        COMMENT '数据来源平台: unicef, ungm, who, undp, cn_gov, dgmarket 等',
        source_url      VARCHAR(2000) NULL DEFAULT NULL
                        COMMENT '原始页面/PDF 链接',
        external_id     VARCHAR(200)  NULL DEFAULT NULL
                        COMMENT '来源平台的外部唯一标识（如 UNGM award ID）',

        -- 中标核心信息
        title           VARCHAR(1000) NOT NULL DEFAULT ''
                        COMMENT '中标项目名称',
        title_cn        VARCHAR(1000) NULL DEFAULT NULL
                        COMMENT '中标项目名称（中文）',
        reference       VARCHAR(200)  NULL DEFAULT NULL
                        COMMENT '招标编号 / 合同编号',
        contract_no     VARCHAR(200)  NULL DEFAULT NULL
                        COMMENT '合同编号',

        -- 采购机构
        agency          VARCHAR(200)  NULL DEFAULT NULL
                        COMMENT '采购机构简称（如 UNICEF）',
        agency_full     VARCHAR(500)  NULL DEFAULT NULL
                        COMMENT '采购机构全称',
        country         VARCHAR(100)  NULL DEFAULT NULL
                        COMMENT '采购国家/地区',

        -- 中标信息
        award_date      DATE          NULL DEFAULT NULL
                        COMMENT '中标公示日期',
        contract_value  DECIMAL(18,2) NULL DEFAULT NULL
                        COMMENT '合同金额（原始币种）',
        contract_value_usd DECIMAL(18,2) NULL DEFAULT NULL
                        COMMENT '合同金额（美元换算）',
        currency        VARCHAR(10)   NULL DEFAULT 'USD'
                        COMMENT '币种',
        description     TEXT          NULL DEFAULT NULL
                        COMMENT '中标项目描述（原文）',
        description_cn  TEXT          NULL DEFAULT NULL
                        COMMENT '中标项目描述（中文）',

        -- 分类
        category        VARCHAR(300)  NULL DEFAULT NULL
                        COMMENT '采购品类名称',
        unspsc_code     VARCHAR(20)   NULL DEFAULT NULL
                        COMMENT 'UNSPSC 编码',
        industry        VARCHAR(100)  NULL DEFAULT NULL
                        COMMENT '行业分类',

        -- 关联
        source_notice_id VARCHAR(100) NULL DEFAULT NULL
                        COMMENT '关联的 crm_bid_notices.notice_id（如可匹配）',

        -- 原始数据保留
        raw_data        JSON          NULL DEFAULT NULL
                        COMMENT '爬虫原始数据（JSON），便于回溯与重新解析',

        -- 审计字段
        crawl_time      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                        COMMENT '爬取时间',
        create_time     INT UNSIGNED  NULL DEFAULT NULL
                        COMMENT 'Unix 时间戳（兼容 daily-sync 水位线）',
        update_time     INT UNSIGNED  NULL DEFAULT NULL
                        COMMENT 'Unix 时间戳（兼容 daily-sync 水位线）',

        -- 索引
        UNIQUE KEY uk_source_external (source_platform, external_id),
        KEY idx_award_date (award_date),
        KEY idx_agency (agency),
        KEY idx_country (country),
        KEY idx_reference (reference),
        KEY idx_source_notice (source_notice_id),
        KEY idx_update_time (update_time),
        KEY idx_crawl_time (crawl_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── 中标商信息表（一个中标可能有多个中标商/联合体） ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_bid_award_winners (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        award_id        BIGINT UNSIGNED NOT NULL
                        COMMENT '关联 crm_bid_awards.id',

        winner_name     VARCHAR(500)  NOT NULL DEFAULT ''
                        COMMENT '中标商名称（英文/原文）',
        winner_name_cn  VARCHAR(500)  NULL DEFAULT NULL
                        COMMENT '中标商名称（中文）',
        winner_country  VARCHAR(100)  NULL DEFAULT NULL
                        COMMENT '中标商所在国家',
        winner_type     VARCHAR(50)   NULL DEFAULT NULL
                        COMMENT '中标商类型: supplier, consortium, ngo, government 等',

        -- 资质信息
        registration_level VARCHAR(20) NULL DEFAULT NULL
                        COMMENT 'UNGM 注册等级（L1/L2）',
        certifications  JSON          NULL DEFAULT NULL
                        COMMENT '资质证书列表（JSON 数组）',

        -- 合同金额（联合体场景下各中标商分摊）
        share_amount    DECIMAL(18,2) NULL DEFAULT NULL
                        COMMENT '该中标商分摊金额',
        share_currency  VARCHAR(10)   NULL DEFAULT NULL
                        COMMENT '分摊金额币种',

        -- 联系信息
        contact_email   VARCHAR(200)  NULL DEFAULT NULL,
        contact_phone   VARCHAR(50)   NULL DEFAULT NULL,
        website         VARCHAR(500)  NULL DEFAULT NULL,

        create_time     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

        KEY idx_award_id (award_id),
        KEY idx_winner_name (winner_name(191)),
        KEY idx_winner_country (winner_country),
        CONSTRAINT fk_award_winners_award
          FOREIGN KEY (award_id) REFERENCES crm_bid_awards(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("[migration-078] crm_bid_awards + crm_bid_award_winners 已创建");
  },
};
