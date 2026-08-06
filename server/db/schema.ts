/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import type { RowDataPacket } from "mysql2/promise";

export async function ensureColumn(dbPool: any, table: string, column: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) === 0) {
    await dbPool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export async function ensureColumnType(dbPool: any, table: string, column: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if ((rows as RowDataPacket[]).length > 0) {
    await dbPool.query(`ALTER TABLE ${table} MODIFY COLUMN ${ddl}`);
  }
}

export async function ensureIndex(dbPool: any, table: string, indexName: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) === 0) {
    await dbPool.query(ddl);
  }
}

export async function ensureIndexIfTableExists(dbPool: any, table: string, indexName: string, ddl: string) {
  const [tableRows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  if (Number((tableRows as RowDataPacket[])[0]?.total || 0) === 0) return;
  await ensureIndex(dbPool, table, indexName, ddl);
}

export async function ensureProcurementSchema(dbPool: any) {
  // ── 系统配置表（备案号等站点级配置）──
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS \`system\` (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      bah VARCHAR(120) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL UNIQUE,
      email VARCHAR(190) NULL,
      display_name VARCHAR(190) NULL,
      password_hash VARCHAR(128) NULL,
      membership_tier VARCHAR(40) NOT NULL DEFAULT 'free',
      account_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      supplier_id BIGINT UNSIGNED NULL,
      supplier_link_status VARCHAR(30) NOT NULL DEFAULT 'none',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_users", "password_hash", "password_hash VARCHAR(128) NULL AFTER display_name");
  await ensureColumn(dbPool, "crm_users", "membership_tier", "membership_tier VARCHAR(40) NOT NULL DEFAULT 'free' AFTER password_hash");
  await ensureColumn(dbPool, "crm_users", "account_status", "account_status VARCHAR(30) NOT NULL DEFAULT 'pending' AFTER membership_tier");
  await ensureColumn(dbPool, "crm_users", "supplier_id", "supplier_id BIGINT UNSIGNED NULL AFTER membership_tier");
  await ensureColumn(dbPool, "crm_users", "supplier_link_status", "supplier_link_status VARCHAR(30) NOT NULL DEFAULT 'none' AFTER supplier_id");
  await ensureIndex(dbPool, "crm_users", "idx_supplier_link", "CREATE INDEX idx_supplier_link ON crm_users (supplier_id, supplier_link_status)");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_training_registrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      legacy_supplier_id BIGINT UNSIGNED NULL UNIQUE,
      company_name VARCHAR(255) NOT NULL,
      industry_id INT NULL,
      industry VARCHAR(255) NULL,
      main_product VARCHAR(255) NULL,
      export_experience VARCHAR(255) NULL,
      certification TEXT NULL,
      contact_name VARCHAR(100) NOT NULL,
      position VARCHAR(100) NULL,
      telephone VARCHAR(50) NOT NULL,
      email VARCHAR(190) NULL,
      remark TEXT NULL,
      audit_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      ip VARCHAR(45) NULL,
      KEY idx_training_status (audit_status),
      KEY idx_training_contact (telephone, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ungm_1v1_appointments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      appointment_key VARCHAR(190) NOT NULL UNIQUE,
      company_name VARCHAR(255) NOT NULL,
      country VARCHAR(120) NULL,
      city VARCHAR(120) NULL,
      contact_person VARCHAR(190) NOT NULL,
      contact_method VARCHAR(190) NOT NULL,
      email VARCHAR(190) NULL,
      industry VARCHAR(190) NULL,
      consultation_needs TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      follow_up_logs JSON NULL,
      extra JSON NULL,
      raw_payload JSON NULL,
      ip VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ungm_1v1_status_created (status, created_at),
      INDEX idx_ungm_1v1_contact_method (contact_method)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_subscriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      plan_code VARCHAR(60) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_key_status (user_key, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_user_subscriptions", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_membership_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plan_code VARCHAR(60) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
      duration_days INT NULL,
      unlock_quota INT NOT NULL DEFAULT 0,
      free_quota INT NOT NULL DEFAULT 0,
      plan_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
      is_active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_active_sort (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await dbPool.execute(`
    INSERT INTO crm_membership_plans
      (plan_code, name, description, price, duration_days, unlock_quota, free_quota, plan_type, sort_order)
    VALUES
      ('free', '基础体验版', '免费注册供应商，浏览目录并免费解锁 3 条完整订单。', 0, NULL, 3, 3, 'free', 0),
      ('single_89', '单点解锁', '单条查看完整采购详情与机构信息。', 89, NULL, 1, 0, 'single', 10),
      ('trial_99_3', '尝鲜特惠包', '适合初步测试转化率，3 条订单额度。', 99, NULL, 3, 0, 'bundle', 20),
      ('week_299_21', '抢单周卡', '7 天内 21 条订单额度，适合集中筛单。', 299, 7, 21, 0, 'subscription', 30),
      ('annual_5600', '企业至尊年卡', '全年最高 1095 条订单额度，适合团队稳定使用。', 5600, 365, 1095, 0, 'subscription', 40),
      ('annual_8800', '年度顾问服务', '年度顾问服务，含采购机会对接与专业支持。', 8800, 365, 0, 0, 'manual', 45),
      ('annual_manual_8800', '年度人工顾问服务', '含线索对接指导、投标机会分析、合同流程、企业转账确认及微信服务群。', 8800, 365, 0, 0, 'manual', 50)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      price = VALUES(price),
      duration_days = VALUES(duration_days),
      unlock_quota = VALUES(unlock_quota),
      free_quota = VALUES(free_quota),
      plan_type = VALUES(plan_type),
      sort_order = VALUES(sort_order),
      is_active = 1,
      updated_at = NOW()
  `);
  await dbPool.execute(`
    UPDATE crm_membership_plans
    SET
      name = CASE plan_code
        WHEN 'free' THEN '基础体验版'
        WHEN 'single_89' THEN '单点解锁'
        WHEN 'trial_99_3' THEN '尝鲜特惠包'
        WHEN 'week_299_21' THEN '抢单周卡'
        WHEN 'annual_5600' THEN '企业至尊年卡'
        ELSE name
      END,
      description = CASE plan_code
        WHEN 'free' THEN '免费注册供应商，浏览目录并免费解锁 3 条完整订单。'
        WHEN 'single_89' THEN '单条查看完整采购详情与机构信息。'
        WHEN 'trial_99_3' THEN '适合初步测试转化率，3 条订单额度。'
        WHEN 'week_299_21' THEN '7 天内 21 条订单额度，适合集中筛单。'
        WHEN 'annual_5600' THEN '全年最高 1095 条订单额度，适合团队稳定使用。'
        ELSE description
      END,
      updated_at = NOW()
    WHERE plan_code IN ('free','single_89','trial_99_3','week_299_21','annual_5600','annual_8800','annual_manual_8800')
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_payment_orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      order_no VARCHAR(80) NOT NULL UNIQUE,
      user_key VARCHAR(190) NOT NULL,
      provider ENUM('alipay','wechat','mock') NOT NULL,
      plan_code VARCHAR(60) NOT NULL,
      notice_id BIGINT UNSIGNED NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
      status ENUM('pending','paid','closed','failed') NOT NULL DEFAULT 'pending',
      provider_trade_no VARCHAR(120) NULL,
      pay_url VARCHAR(500) NULL,
      qr_code_url VARCHAR(500) NULL,
      raw_request JSON NULL,
      raw_notify JSON NULL,
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_status (user_key, status),
      KEY idx_plan_code (plan_code),
      KEY idx_notice_id (notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_payment_orders", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");
  await ensureColumn(dbPool, "crm_payment_orders", "pay_url", "pay_url VARCHAR(500) NULL AFTER provider_trade_no");
  await ensureColumn(dbPool, "crm_payment_orders", "qr_code_url", "qr_code_url VARCHAR(500) NULL AFTER pay_url");
  await ensureColumn(dbPool, "crm_payment_orders", "raw_request", "raw_request JSON NULL AFTER qr_code_url");
  await ensureColumn(dbPool, "crm_payment_orders", "raw_notify", "raw_notify JSON NULL AFTER raw_request");
  await ensureColumn(dbPool, "crm_payment_orders", "paid_at", "paid_at DATETIME NULL AFTER raw_notify");
  await ensureColumnType(dbPool, "crm_payment_orders", "provider", "provider ENUM('alipay','wechat','mock') NOT NULL");
  await ensureColumnType(dbPool, "crm_payment_orders", "pay_url", "pay_url TEXT NULL");
  await ensureColumnType(dbPool, "crm_payment_orders", "qr_code_url", "qr_code_url TEXT NULL");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_payment_provider_configs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider ENUM('alipay','wechat') NOT NULL,
      mode VARCHAR(30) NOT NULL DEFAULT 'mock',
      app_id VARCHAR(190) NULL,
      merchant_id VARCHAR(190) NULL,
      notify_url VARCHAR(500) NULL,
      return_url VARCHAR(500) NULL,
      public_key TEXT NULL,
      private_key_ref VARCHAR(500) NULL,
      cert_ref VARCHAR(500) NULL,
      is_active TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_provider_mode (provider, mode),
      KEY idx_provider_active (provider, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_payment_provider_configs", "mode", "mode VARCHAR(30) NOT NULL DEFAULT 'mock' AFTER provider");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "app_id", "app_id VARCHAR(190) NULL AFTER mode");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "merchant_id", "merchant_id VARCHAR(190) NULL AFTER app_id");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "notify_url", "notify_url VARCHAR(500) NULL AFTER merchant_id");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "return_url", "return_url VARCHAR(500) NULL AFTER notify_url");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "public_key", "public_key TEXT NULL AFTER return_url");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "private_key_ref", "private_key_ref VARCHAR(500) NULL AFTER public_key");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "cert_ref", "cert_ref VARCHAR(500) NULL AFTER private_key_ref");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "is_active", "is_active TINYINT NOT NULL DEFAULT 0 AFTER cert_ref");
  await ensureColumnType(dbPool, "crm_payment_provider_configs", "private_key_ref", "private_key_ref TEXT NULL");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_entitlements (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      source_order_no VARCHAR(80) NULL,
      plan_code VARCHAR(60) NOT NULL,
      quota_total INT NOT NULL DEFAULT 0,
      quota_used INT NOT NULL DEFAULT 0,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_status_expire (user_key, status, expires_at),
      KEY idx_source_order (source_order_no),
      KEY idx_plan_code (plan_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_user_entitlements", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");
  await ensureColumn(dbPool, "crm_user_entitlements", "source_order_no", "source_order_no VARCHAR(80) NULL AFTER user_key");
  await ensureColumn(dbPool, "crm_user_entitlements", "plan_code", "plan_code VARCHAR(60) NOT NULL AFTER source_order_no");
  await ensureColumn(dbPool, "crm_user_entitlements", "quota_total", "quota_total INT NOT NULL DEFAULT 0 AFTER plan_code");
  await ensureColumn(dbPool, "crm_user_entitlements", "quota_used", "quota_used INT NOT NULL DEFAULT 0 AFTER quota_total");
  await ensureColumn(dbPool, "crm_user_entitlements", "expires_at", "expires_at DATETIME NULL AFTER started_at");
  await ensureColumn(dbPool, "crm_user_entitlements", "status", "status VARCHAR(30) NOT NULL DEFAULT 'active' AFTER expires_at");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_opportunity_unlocks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      opportunity_id BIGINT UNSIGNED NULL,
      notice_id BIGINT UNSIGNED NULL,
      unlock_type ENUM('free','single','subscription') NOT NULL DEFAULT 'free',
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unspsc_codes_snapshot JSON NULL,
      UNIQUE KEY uk_user_opportunity (user_key, opportunity_id),
      KEY idx_user_type_time (user_key, unlock_type, unlocked_at),
      KEY idx_opportunity_id (opportunity_id),
      KEY idx_notice_id (notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_notice_views (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      opportunity_id BIGINT UNSIGNED NULL,
      notice_id BIGINT UNSIGNED NULL,
      viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip VARCHAR(45) NULL,
      KEY idx_user_time (user_key, viewed_at),
      KEY idx_opportunity_view (opportunity_id),
      KEY idx_notice_view (notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_interest_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      source VARCHAR(40) NOT NULL,
      weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_code_source (user_key, code, source),
      KEY idx_user_code (user_key, code),
      KEY idx_code_id (code_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── 账号默认行业偏好（本地差异 #5：偏好表 + 读写接口）──
  // 存储用户在注册/个人中心选取的 UNSPSC 类目路径，公采页进入时按此默认筛选
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_industry_prefs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL,
      level1_id INT NULL,
      level2_id INT NULL,
      level3_id INT NULL,
      level4_id INT NULL,
      level5_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_pref (user_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_interests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      notice_id BIGINT UNSIGNED NOT NULL,
      interest_type ENUM('interested','subscribed') NOT NULL DEFAULT 'interested',
      source VARCHAR(40) NOT NULL DEFAULT 'detail_page',
      note VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_notice_type (user_key, notice_id, interest_type),
      KEY idx_user_time (user_key, created_at),
      KEY idx_notice_type (notice_id, interest_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_notice_interests", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

  // ── 公采搜索功能（本地差异 #6：G.4 搜索行为流水表）──
  // supply-os 自有表：记录搜索关键词/国家筛选/命中数。country 记录供 D.2 显式地区偏好，
  // result_cnt=0 即"搜而无果"供运营反哺拆解选题；user_key 可 NULL（游客不落身份）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_search_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NULL,
      q VARCHAR(200) NULL,
      country VARCHAR(100) NULL,
      filters JSON NULL,
      result_cnt INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_time (user_key, created_at),
      KEY idx_zero_result (result_cnt, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #8：C.3.5 数据质量快照表（supply-os 自有表，只读扫描外部表后落此）。
  // dup_notice_cnt 为 F.5 重复检测指标：notice_id 非空行数 - 去重数（NULL 不计入重复）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_data_quality_snapshot (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      total_notices INT NOT NULL,
      missing_value INT NOT NULL DEFAULT 0,
      missing_country INT NOT NULL DEFAULT 0,
      missing_deadline INT NOT NULL DEFAULT 0,
      unlinked_unspsc INT NOT NULL DEFAULT 0,
      expired_but_active INT NOT NULL DEFAULT 0,
      dup_notice_cnt INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_date (snapshot_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #10：T-B3 金额解析缓存表（D.3.2 落地）。外部表 estimated_value 为自由文本、
  // 解析只能在 JS 做，而推荐排序是单遍 SQL 分页（D.1 路线 2）——故解析结果预计算到此自有表，
  // recommended JOIN 本表算 s_amount。amount_usd 用粗粒度静态汇率折算供跨币种可比；
  // 解析规则/汇率更新时递增 AMOUNT_PARSE_VERSION，旧版本行按版本失效重算
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_amount_cache (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(20,2) NULL,
      currency VARCHAR(10) NULL,
      amount_usd DECIMAL(20,2) NULL,
      inferred TINYINT(1) NOT NULL DEFAULT 0,
      parse_version SMALLINT NOT NULL DEFAULT 1,
      parsed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notice (notice_id),
      KEY idx_version (parse_version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #11：T-B2 推荐反馈流水表（B.3.1）。建表即落两项裁决：
  // D.5——action ENUM 直接含隐式信号（dwell/scroll_end/quick_exit/revisit）+ dwell_ms 列，避免后续 ALTER；
  // D.7——impression 去重采用"前端 Set 预去重 + 服务端唯一约束 uk_dedup 兜底"双层方案（INSERT IGNORE 写入，
  //       session_id 为 NULL 时唯一约束不生效，故前端必须传 session_id）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_reco_feedback (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      notice_id BIGINT UNSIGNED NOT NULL,
      action ENUM('impression','click','unlock','dismiss','favorite','dwell','scroll_end','quick_exit','revisit') NOT NULL,
      reco_score DECIMAL(8,4) NULL,
      position INT NULL,
      variant VARCHAR(20) NULL,
      session_id VARCHAR(64) NULL,
      dwell_ms INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_dedup (user_key, notice_id, session_id, action),
      KEY idx_user_time (user_key, created_at),
      KEY idx_notice_action (notice_id, action),
      KEY idx_variant (variant, action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #11：T-B2 每用户维度权重档案（反馈微调结果，缺失走全局默认——B.3.1）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_reco_weight_profile (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL,
      w_unspsc DECIMAL(5,3) NOT NULL DEFAULT 0.500,
      w_agency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
      w_amount DECIMAL(5,3) NOT NULL DEFAULT 0.100,
      w_geo DECIMAL(5,3) NOT NULL DEFAULT 0.100,
      w_urgency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user (user_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #12：T-E2 浏览量日汇总 rollup 表（原文档 E.2 DDL）。聚合触发为懒计算/admin 手动
  // （无定时器，约束 6）；冷启动热度优先读本表，空则回落直查原始 views 表
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_view_daily (
      notice_id BIGINT UNSIGNED NOT NULL,
      stat_day DATE NOT NULL,
      view_cnt INT NOT NULL DEFAULT 0,
      uniq_user_cnt INT NOT NULL DEFAULT 0,
      PRIMARY KEY (notice_id, stat_day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id BIGINT UNSIGNED NOT NULL,
      lang VARCHAR(10) NOT NULL,
      title_tr TEXT NULL,
      description_tr MEDIUMTEXT NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notice_lang (notice_id, lang),
      KEY idx_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── 增量翻译状态表（本地差异 #19：多语言搜索与翻译机制完善）──
  // 三个 state_key：
  //   notice_id_cutoff  存量/新增分界线，首次建表时以 MAX(id) 定格，永不推进；
  //                     定时任务扫描条件加 n.id > cutoff，历史存量不主动翻译，
  //                     仅在用户按对应语言查看时走按需翻译。
  //   budget_day        预算统计所属日期（YYYY-MM-DD），跨天时重置。
  //   budget_chars_used 当日已消耗源字符数，每轮累加；达日上限时停到次日。
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_translation_state (
      state_key VARCHAR(64) NOT NULL PRIMARY KEY,
      state_value VARCHAR(255) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 水位定格：INSERT IGNORE 保证只在键不存在时写入一次，重启不会重复定格。
  // SELECT MAX(id) 取执行瞬间的真实值，避免硬编码漂移。
  await dbPool.query(`
    INSERT IGNORE INTO crm_translation_state (state_key, state_value)
    SELECT 'notice_id_cutoff', CAST(COALESCE(MAX(id), 0) AS CHAR)
      FROM crm_bid_notices
  `);

  // 精选数据（crm_bid_opportunities）独立翻译缓存表，与 crm_notice_translations 同构；
  // 定时任务双表扫描与按需正文翻译端点共用
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_opportunity_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      opportunity_id BIGINT UNSIGNED NOT NULL,
      lang VARCHAR(10) NOT NULL,
      title_tr TEXT NULL,
      description_tr MEDIUMTEXT NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_opp_lang (opportunity_id, lang),
      KEY idx_opp_tr_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 精选表水位定格：语义同 notice_id_cutoff，仅首次建表时以 MAX(id) 写入一次
  await dbPool.query(`
    INSERT IGNORE INTO crm_translation_state (state_key, state_value)
    SELECT 'opportunity_id_cutoff', CAST(COALESCE(MAX(id), 0) AS CHAR)
      FROM crm_bid_opportunities
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_supplier_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supplier_id BIGINT UNSIGNED NOT NULL,
      lang VARCHAR(10) NOT NULL,
      industry_tr VARCHAR(255) NULL,
      main_products_tr TEXT NULL,
      certification_tr TEXT NULL,
      enterprise_nature_tr VARCHAR(100) NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_supplier_lang (supplier_id, lang),
      KEY idx_supplier_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // UNSPSC 类目标题译文缓存（fr/ru/es/ar；zh/en 直接用 crm_unspsc_codes 原列）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_unspsc_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code_id INT NOT NULL,
      lang VARCHAR(10) NOT NULL,
      title_tr VARCHAR(255) NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_code_lang (code_id, lang),
      KEY idx_unspsc_tr_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_supplier_unspsc_interests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supplier_id BIGINT UNSIGNED NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      source VARCHAR(40) NOT NULL,
      weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_supplier_code_source (supplier_id, code, source),
      KEY idx_supplier_code (supplier_id, code),
      KEY idx_code_id (code_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_supplier_claims (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      supplier_id BIGINT UNSIGNED NULL,
      company_name VARCHAR(255) NOT NULL,
      supplier_type VARCHAR(40) NOT NULL DEFAULT 'domestic',
      contact_name VARCHAR(100) NULL,
      contact_phone VARCHAR(80) NULL,
      contact_email VARCHAR(190) NULL,
      business_license_no VARCHAR(120) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_status (user_key, status),
      KEY idx_supplier_status (supplier_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_supplier_claims", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

  for (const tableSql of [
    `CREATE TABLE IF NOT EXISTS crm_bid_opportunity_unspsc_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      opportunity_id BIGINT UNSIGNED NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      level1_id INT NULL,
      level2_id INT NULL,
      level3_id INT NULL,
      level4_id INT NULL,
      level5_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_opp_code (opportunity_id, code),
      KEY idx_code_id (code_id),
      KEY idx_level1 (level1_id),
      KEY idx_level2 (level2_id),
      KEY idx_level3 (level3_id),
      KEY idx_level4 (level4_id),
      KEY idx_level5 (level5_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // 注意：实际 CRM 侧建立的桥接表 notice_id 为 varchar(100)（存外部编号），
    // 此处 DDL 仅作桥接表不存在时的兆底。生产环境以 CRM 侧建表为准。
    `CREATE TABLE IF NOT EXISTS crm_bid_notice_unspsc_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id VARCHAR(100) NOT NULL,
      code_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '',
      level TINYINT UNSIGNED NOT NULL DEFAULT 0,
      level1_id VARCHAR(32) NOT NULL DEFAULT '',
      level2_id VARCHAR(32) NOT NULL DEFAULT '',
      level3_id VARCHAR(32) NOT NULL DEFAULT '',
      level4_id VARCHAR(32) NOT NULL DEFAULT '',
      level5_id VARCHAR(32) NOT NULL DEFAULT '',
      created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notice_code (notice_id, code),
      KEY idx_code (code),
      KEY idx_notice_level1_notice (level1_id, notice_id),
      KEY idx_notice_level2_notice (level2_id, notice_id),
      KEY idx_notice_level3_notice (level3_id, notice_id),
      KEY idx_notice_level4_notice (level4_id, notice_id),
      KEY idx_notice_level5_notice (level5_id, notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ]) {
    await dbPool.query(tableSql);
  }

  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level1_notice", "CREATE INDEX idx_notice_level1_notice ON crm_bid_notice_unspsc_codes (level1_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level2_notice", "CREATE INDEX idx_notice_level2_notice ON crm_bid_notice_unspsc_codes (level2_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level3_notice", "CREATE INDEX idx_notice_level3_notice ON crm_bid_notice_unspsc_codes (level3_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level4_notice", "CREATE INDEX idx_notice_level4_notice ON crm_bid_notice_unspsc_codes (level4_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level5_notice", "CREATE INDEX idx_notice_level5_notice ON crm_bid_notice_unspsc_codes (level5_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_code_notice", "CREATE INDEX idx_notice_code_notice ON crm_bid_notice_unspsc_codes (code, notice_id)");
  // UNSPSC 行业筛选优化：主表 notice_id 索引（加速桥接表 JOIN 的 MySQL 降级路径）
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_notices_notice_id", "CREATE INDEX idx_notices_notice_id ON crm_bid_notices (notice_id)");
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_active_deadline_id", "CREATE INDEX idx_bid_notices_active_deadline_id ON crm_bid_notices (is_expired, deadline_ts, id)");

  // P1 性能优化：deadline_sec 生成列——将 deadline_ts（可能为毫秒级）统一转为秒级，
  // 使 ORDER BY/WHERE 可走索引，避免每行计算 IF(...FLOOR(...)/1000...)
  await ensureColumn(
    dbPool,
    "crm_bid_notices",
    "deadline_sec",
    "deadline_sec INT UNSIGNED AS (IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)) STORED"
  );
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_deadline_sec", "CREATE INDEX idx_bid_notices_deadline_sec ON crm_bid_notices (deadline_sec)");

  // P1 性能优化：crm_bid_opportunities 也需要 deadline_sec 生成列（autoTranslate 双表扫描共用同一表达式）
  await ensureColumn(
    dbPool,
    "crm_bid_opportunities",
    "deadline_sec",
    "deadline_sec INT UNSIGNED AS (IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)) STORED"
  );
  await ensureIndexIfTableExists(dbPool, "crm_bid_opportunities", "idx_opp_deadline_sec", "CREATE INDEX idx_opp_deadline_sec ON crm_bid_opportunities (deadline_sec)");
  await ensureIndexIfTableExists(dbPool, "crm_unspsc_codes", "idx_unspsc_level_id", "CREATE INDEX idx_unspsc_level_id ON crm_unspsc_codes (level, id)");
  await ensureIndexIfTableExists(dbPool, "crm_unspsc_codes", "idx_unspsc_parent_code", "CREATE INDEX idx_unspsc_parent_code ON crm_unspsc_codes (parent_id, code)");

  // P5 性能优化：crm_bid_opportunities 索引补建——为 FEATURED_NOTICE_EXISTS 两路 IN 子查询建立覆盖索引
  // 诊断结果：表 6411 行，source_notice_id 已有 idx_source_notice（单列），is_qualified/audit_status 无索引
  // 回滚：DROP INDEX idx_opp_qualified_id ON crm_bid_opportunities; DROP INDEX idx_opp_source_covering ON crm_bid_opportunities;
  // 路径 1：SELECT id WHERE is_qualified=1 OR status='won' OR audit_status=1 → 覆盖索引避免回表
  await ensureIndexIfTableExists(dbPool, "crm_bid_opportunities", "idx_opp_qualified_id",
    "CREATE INDEX idx_opp_qualified_id ON crm_bid_opportunities (is_qualified, status, audit_status, id)");
  // 路径 2：SELECT source_notice_id WHERE ... AND source_notice_id IS NOT NULL → 覆盖索引（增强已有 idx_source_notice）
  await ensureIndexIfTableExists(dbPool, "crm_bid_opportunities", "idx_opp_source_covering",
    "CREATE INDEX idx_opp_source_covering ON crm_bid_opportunities (source_notice_id, is_qualified, status, audit_status)");

  // P6 性能优化：is_featured 预计算列——消除每次查询的 FEATURED_NOTICE_EXISTS 实时计算
  // 精选判定依赖 CRM 机会表，更新频率低（天级），预计算后查询从 IN 子查询变为直接读列
  // 回滚：ALTER TABLE crm_bid_notices DROP COLUMN is_featured;
  await ensureColumn(
    dbPool,
    "crm_bid_notices",
    "is_featured",
    "is_featured TINYINT(1) NOT NULL DEFAULT 0"
  );
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_featured",
    "CREATE INDEX idx_bid_notices_featured ON crm_bid_notices (is_featured)");

  // P1 性能优化：复合筛选索引——加速 country/agency/notice_type 多条件组合查询
  // 回滚：DROP INDEX idx_notices_filter ON crm_bid_notices;
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_notices_filter",
    "CREATE INDEX idx_notices_filter ON crm_bid_notices (country(100), agency(100), notice_type(50))");

  // 方案C 性能优化：预计算常用总数表——消除无筛选/单条件场景的 COUNT(DISTINCT) 全表扫描
  // 回滚：DROP TABLE IF EXISTS crm_notice_stats;
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_stats (
      stat_key VARCHAR(100) NOT NULL PRIMARY KEY,
      stat_value INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 方案D 性能优化：is_active 预计算列——消除 OR 条件阻止索引利用的问题
  // 将 (is_expired=0 OR IS NULL) AND (deadline_ts IS NULL OR deadline_sec>=NOW()) 简化为 is_active=1
  // 配合复合索引 (is_active, deadline_sec) 实现索引扫描 + 索引排序，消除 filesort
  // 回滚：ALTER TABLE crm_bid_notices DROP COLUMN is_active;
  await ensureColumn(
    dbPool,
    "crm_bid_notices",
    "is_active",
    "is_active TINYINT(1) NOT NULL DEFAULT 1"
  );
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_notices_active_deadline",
    "CREATE INDEX idx_notices_active_deadline ON crm_bid_notices (is_active, deadline_sec)");

  // 方案B 性能优化：FULLTEXT 全文索引——加速关键词搜索，替代 LIKE '%keyword%' 全表扫描
  // ngram 解析器支持中文分词（MySQL 5.7+ 内置），BOOLEAN MODE 支持多词搜索
  // 回滚：DROP INDEX ft_notices_search ON crm_bid_notices;
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "ft_notices_search",
    "CREATE FULLTEXT INDEX ft_notices_search ON crm_bid_notices (title, reference, description) WITH PARSER ngram");

  // 英文路径 FULLTEXT：title+reference（非 ngram，英文单词完整分词）
  // 回滚：DROP INDEX ft_notices_en ON crm_bid_notices;
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "ft_notices_en",
    "CREATE FULLTEXT INDEX ft_notices_en ON crm_bid_notices (title, reference)");

  // 英文 description 补充 FULLTEXT（非 ngram）
  // 回滚：DROP INDEX ft_notices_desc ON crm_bid_notices;
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "ft_notices_desc",
    "CREATE FULLTEXT INDEX ft_notices_desc ON crm_bid_notices (description)");

  // 翻译表 FULLTEXT（ngram，支持中英文跨语言搜索）
  // 回滚：DROP INDEX ft_trans_search ON crm_notice_translations;
  await ensureIndexIfTableExists(dbPool, "crm_notice_translations", "ft_trans_search",
    "CREATE FULLTEXT INDEX ft_trans_search ON crm_notice_translations (title_tr, description_tr) WITH PARSER ngram");

  // ── 机构别名映射表（归一化去重增强：将缩写/别名映射到标准名称）──
  // 例：UNDP / UNITED NATIONS DEVELOPMENT PROGRAMME → 同一 canonical 名
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_agency_aliases (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      canonical VARCHAR(255) NOT NULL COMMENT '标准机构名（展示用）',
      alias VARCHAR(255) NOT NULL COMMENT '别名（匹配用，大写存储）',
      name_i18n JSON NULL COMMENT '机构名多语言翻译 {zh, fr, ru, es, ar}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_alias (alias),
      KEY idx_canonical (canonical)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_agency_aliases", "name_i18n", "name_i18n JSON NULL COMMENT '机构名多语言翻译 {zh, fr, ru, es, ar}'");
}

