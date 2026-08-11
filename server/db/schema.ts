/**
 * Schema 迁移入口
 * Schema migration entry point
 *
 * @module server/db/schema
 * @description 版本化 DDL 迁移系统。所有表结构定义已拆分至 migrations/ 目录，
 *              本文件为入口：导入所有迁移并交给 runner 按版本号顺序执行。
 *              已执行的迁移自动跳过（幂等安全）。
 *
 *              迁移文件列表：
 *              001-core-tables.ts           系统/用户/培训/预约
 *              002-membership-payment.ts    会员/订阅/支付/权益
 *              003-notice-interactions.ts   解锁/浏览/兴趣/偏好
 *              004-search-quality-feedback  搜索/质量/统计/反馈
 *              005-translations.ts          翻译/状态追踪
 *              006-suppliers.ts             供应商认领/UNSPSC兴趣
 *              007-unspsc-bridge.ts         UNSPSC桥接表
 *              008-agency-aliases.ts        机构别名映射
 *              009-external-table-indexes   CRM外部表索引
 *              010-fulltext-indexes.ts      全文搜索索引
 *              011-notice-search-wide-table 搜索宽表
 *              012-password-reset-security  找回密码/密码安全升级
 *              013-wide-table-varchar       宽表description列LONGTEXT→VARCHAR(2000)
 *              014-password-reset-email-columns  补齐crm_password_resets缺失列(email_sent/email_error)
 */
import type { Pool } from "mysql2/promise";
import { runMigrations, type Migration } from "./migrations/runner";
import { migration as m001 } from "./migrations/001-core-tables";
import { migration as m002 } from "./migrations/002-membership-payment";
import { migration as m003 } from "./migrations/003-notice-interactions";
import { migration as m004 } from "./migrations/004-search-quality-feedback";
import { migration as m005 } from "./migrations/005-translations";
import { migration as m006 } from "./migrations/006-suppliers";
import { migration as m007 } from "./migrations/007-unspsc-bridge";
import { migration as m008 } from "./migrations/008-agency-aliases";
import { migration as m009 } from "./migrations/009-external-table-indexes";
import { migration as m010 } from "./migrations/010-fulltext-indexes";
import { migration as m011 } from "./migrations/011-notice-search-wide-table";
import { migration as m012 } from "./migrations/012-password-reset-security";
import { migration as m013 } from "./migrations/013-wide-table-varchar";
import { migration as m014 } from "./migrations/014-password-reset-email-columns";

/** 所有迁移（按版本号排序） */
const ALL_MIGRATIONS: Migration[] = [
  m001, m002, m003, m004, m005,
  m006, m007, m008, m009, m010, m011,
  m012, m013, m014,
];

/**
 * 执行所有待应用的 schema 迁移
 * @returns 本次执行的迁移数量
 */
export async function ensureProcurementSchema(dbPool: Pool): Promise<number> {
  return runMigrations(dbPool, ALL_MIGRATIONS);
}

// ── 向后兼容：导出工具函数供外部使用 ──
export { ensureColumn, ensureColumnType, ensureIndex, ensureIndexIfTableExists } from "./migrations/runner";
