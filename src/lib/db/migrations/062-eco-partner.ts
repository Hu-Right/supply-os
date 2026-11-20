/**
 * 迁移 062 — 第三方服务生态伙伴表
 *
 * @module server/db/migrations/062-eco-partner
 * @description 2026-11-20：第三方服务生态从 /services 页静态数据迁库（src/data/services.ts
 *              的 ECO_PARTNERS）。只建结构，**不做任何种子数据**——伙伴行（含对等迁移的
 *              富士康/小米、华测）统一由运营侧后续插入。
 *
 *              状态机：in-talks 洽谈中 → onboarding 已签约筹备上架（可渲染「即将入驻」预告位）
 *              → live 已上架 → suspended 下架（停展不停联）。公开 API 只吐
 *              in-talks/onboarding/live 三态；detail 仅 live 态透出；contact_internal 永不出网。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 62,
  name: "eco_partner",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS eco_partner (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        slug VARCHAR(64) NOT NULL COMMENT '稳定标识（API/运营定位用）',
        name VARCHAR(120) NOT NULL COMMENT '展示名（中文）',
        name_en VARCHAR(160) NULL COMMENT '展示名（英文/原文）',
        category VARCHAR(32) NOT NULL COMMENT '类目：compliance 合规准入 / fulfillment 履约交付 / after-sales 售后服务 / localization 本地化运营',
        scope VARCHAR(300) NOT NULL DEFAULT '' COMMENT '服务能力简述（中文）',
        scope_en VARCHAR(600) NULL COMMENT '服务能力简述（英文，空则读侧回退 scope）',
        detail TEXT NULL COMMENT '服务详情（纯文本段落，仅 live 态透出展示；未出方案为空）',
        regions VARCHAR(200) NOT NULL DEFAULT '' COMMENT '覆盖区域（中文展示文案）',
        regions_en VARCHAR(400) NULL COMMENT '覆盖区域（英文，空则读侧回退 regions）',
        logo_url VARCHAR(300) NULL COMMENT '企业 logo 地址（空则前端首字母块兜底）',
        featured TINYINT(1) NOT NULL DEFAULT 0 COMMENT '锚定位伙伴（伙伴墙头部大卡，通用位不写死任何一家）',
        status VARCHAR(16) NOT NULL DEFAULT 'in-talks' COMMENT 'in-talks 洽谈中 / onboarding 已签约筹备 / live 已上架 / suspended 下架',
        sort_weight INT NOT NULL DEFAULT 0 COMMENT '同态排序权重（大者靠前）',
        contact_internal VARCHAR(300) NULL COMMENT '内部对接联系人（仅运营用，永不出网）',
        listed_at DATETIME NULL COMMENT '上架时间（置 live 时由运营回填）',
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        PRIMARY KEY (id),
        UNIQUE KEY uk_eco_partner_slug (slug),
        KEY idx_eco_partner_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='第三方服务生态伙伴（邀约入驻，2026-11-20 起 /services 伙伴墙数据源）'
    `);
  },
};
