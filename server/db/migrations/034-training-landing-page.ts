/**
 * 034: 研修班招生落地页（仅建表结构，不插入任何数据）
 *
 * @description 创建落地页全部动态内容表：
 *              - training_courses          课程配置（单价/名称/包含内容）
 *              - training_schedules        课程期次（日期/城市/状态/名额）
 *              - training_orders           培训支付订单
 *              - training_instructors      核心讲师（大卡片）
 *              - training_team_members     团队成员（小头像网格）
 *              - training_gallery_categories 课堂照片分类
 *              - training_gallery_images   课堂照片
 *              - training_testimonials     学员反馈
 *              - training_faqs             常见问题
 *              并扩展 crm_training_registrations（payment_status / order_id）。
 *              所有业务内容由运营直接在数据库中录入，不使用种子数据。
 * @module server/db/migrations/034-training-landing-page
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 34,
  name: "training-landing-page",
  async up(dbPool: Pool) {
    // ── 课程配置表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_courses (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name_zh VARCHAR(200) NOT NULL,
        name_en VARCHAR(200) NULL,
        description_zh TEXT NULL,
        description_en TEXT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
        includes JSON NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_courses_status (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 课程期次表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_schedules (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        course_id INT UNSIGNED NOT NULL,
        period_number INT NOT NULL,
        start_date DATE NOT NULL,
        city VARCHAR(50) NOT NULL DEFAULT '杭州',
        format VARCHAR(20) NOT NULL DEFAULT '线下',
        status VARCHAR(20) NOT NULL DEFAULT 'coming_soon',
        capacity INT NULL,
        enrolled_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_schedules_course (course_id, start_date),
        CONSTRAINT fk_training_schedules_course
          FOREIGN KEY (course_id) REFERENCES training_courses (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 培训支付订单表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(64) NOT NULL UNIQUE,
        course_id INT UNSIGNED NOT NULL,
        schedule_id INT UNSIGNED NULL,
        registration_id BIGINT UNSIGNED NULL,
        participant_count INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
        provider VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        qr_code TEXT NULL,
        pay_url VARCHAR(512) NULL,
        provider_trade_no VARCHAR(120) NULL,
        paid_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        contact_name VARCHAR(100) NULL,
        telephone VARCHAR(50) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_orders_status (status),
        KEY idx_training_orders_registration (registration_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 核心讲师表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_instructors (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name_zh VARCHAR(100) NOT NULL,
        name_en VARCHAR(100) NULL,
        roles JSON NOT NULL,
        title_zh VARCHAR(200) NOT NULL,
        title_en VARCHAR(200) NULL,
        bio_zh TEXT NOT NULL,
        bio_en TEXT NULL,
        avatar_path VARCHAR(255) NOT NULL,
        is_featured TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_instructors_status (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 团队成员表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_team_members (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name_zh VARCHAR(100) NOT NULL,
        name_en VARCHAR(100) NULL,
        avatar_path VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_team_status (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 课堂照片分类表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_gallery_categories (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name_zh VARCHAR(100) NOT NULL,
        name_en VARCHAR(100) NULL,
        description_zh VARCHAR(255) NULL,
        description_en VARCHAR(255) NULL,
        cover_image VARCHAR(255) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_gallery_cat_status (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 课堂照片表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_gallery_images (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        category_id INT UNSIGNED NOT NULL,
        image_path VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_training_gallery_img_cat (category_id, sort_order),
        CONSTRAINT fk_training_gallery_images_cat
          FOREIGN KEY (category_id) REFERENCES training_gallery_categories (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 学员反馈表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_testimonials (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        quote_zh TEXT NOT NULL,
        quote_en TEXT NULL,
        author_name VARCHAR(100) NOT NULL,
        author_title VARCHAR(200) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_testimonials_status (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 常见问题表 ──
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS training_faqs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        question_zh VARCHAR(500) NOT NULL,
        question_en VARCHAR(500) NULL,
        answer_zh TEXT NOT NULL,
        answer_en TEXT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_training_faqs_status (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 扩展报名表：支付状态 + 关联订单 ──
    await ensureColumn(dbPool, "crm_training_registrations", "payment_status",
      "payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' AFTER audit_status");
    await ensureColumn(dbPool, "crm_training_registrations", "order_id",
      "order_id BIGINT UNSIGNED NULL AFTER payment_status");

    console.log("[migration-034] 研修班落地页 9 张表 + 2 列扩展创建完成");
  },
};
