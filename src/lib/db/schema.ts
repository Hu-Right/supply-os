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
 *              013-wide-table-varchar       宽表description列LONGTEXT→TEXT
 *              014-password-reset-email-columns  补齐crm_password_resets缺失列(email_sent/email_error)
 *              015-registration-email-verification 注册邮箱验证(code_type字段)
 *              016-user-phone                 用户手机号绑定
 *              017-phone-verification         验证码表扩展支持手机
 *              018-jwt-auth                   JWT认证 refresh_tokens 表
 *              019-reference-index            参考号精确匹配索引
 *              020-unlock-unique-notice       解锁唯一约束(防并发超额)
 *              021-verification-code-hash-column 验证码哈希列扩容
 *              022-verification-code-composite-index 验证码表复合索引
 *              023-footer-social-links 底部社交媒体链接表
 *              024-bridge-int-and-index-cleanup 桥接表类型统一+冗余索引清理
 *              025-wide-table-reference-index 宽表reference列索引
 *              026-wide-table-cleanup         宽表清理:删除FULLTEXT索引+is_active死列+重建索引
 *              027-bridge-column-cleanup      桥接表冗余列清理:删除name列
 *              028-deadline-sec-overflow      deadline_sec生成列溢出修复:GREATEST下界保护+存量数据修复
 *              029-precise-unspsc             宽表精准分类列(precise_level1~5,商机approved精准码)
 *              030-wide-table-deadline-bigint  宽表deadline_sec扩容INT→BIGINT+修复溢出归零数据
 *              031-membership-upgrade           会员套餐平滑升级(权益升级标记列+订单类型列)
 *              032-wide-table-schema-converge   宽表description列前向收敛(P1-17:基线漂移修复→TEXT)
 *              033-main-table-dead-index-cleanup 主表死索引清理(is_active/deadline_ts 相关)
 *              034-training-landing-page         研修班落地页(课程/期次/订单/讲师/团队/照片/反馈/FAQ)
 *              035-training-team-titles           讲师/团队成员职称字段
 *              036-training-team-roles            讲师/团队成员角色字段
 *              037-training-order-payurl-text     培训订单 pay_url 列扩容为 TEXT
 *              038-training-participants          研修班学员信息表
 *              039-training-schedule-seed         研修班期次种子数据
 *              040-training-participants-add-email 学员表补全邮箱列
 *              041-supplier-qualification           供应商国际招投标能力初筛表
 *              042-crm-chat-sessions                 CRM数字人客服会话与消息表
 *              043-invitation-codes                   邀请码与员工业绩追踪
 *              044-full-team-seed                     全员种子数据+预生成邀请码
 *              045-user-registration-type             用户注册类型区分（个人/企业）
 *              046-phone-unique-index                 手机号唯一索引
 *              047-learning-material-purchases        学习资料购买记录表
 *              048-learning-materials                 学习资料表+种子数据
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
import { migration as m015 } from "./migrations/015-registration-email-verification";
import { migration as m016 } from "./migrations/016-user-phone";
import { migration as m017 } from "./migrations/017-phone-verification";
import { migration as m018 } from "./migrations/018-jwt-auth";
import { migration as m019 } from "./migrations/019-reference-index";
import { migration as m020 } from "./migrations/020-unlock-unique-notice";
import { migration as m021 } from "./migrations/021-verification-code-hash-column";
import { migration as m022 } from "./migrations/022-verification-code-composite-index";
import { migration as m023 } from "./migrations/023-footer-social-links";
import { migration as m024 } from "./migrations/024-bridge-int-and-index-cleanup";
import { migration as m025 } from "./migrations/025-wide-table-reference-index";
import { migration as m026 } from "./migrations/026-wide-table-cleanup";
import { migration as m027 } from "./migrations/027-bridge-column-cleanup";
import { migration as m028 } from "./migrations/028-deadline-sec-overflow";
import { migration as m029 } from "./migrations/029-precise-unspsc";
import { migration as m030 } from "./migrations/030-wide-table-deadline-bigint";
import { migration as m031 } from "./migrations/031-membership-upgrade";
import { migration as m032 } from "./migrations/032-wide-table-schema-converge";
import { migration as m033 } from "./migrations/033-main-table-dead-index-cleanup";
import { migration as m034 } from "./migrations/034-training-landing-page";
import { migration as m035 } from "./migrations/035-training-team-titles";
import { migration as m036 } from "./migrations/036-training-team-roles";
import { migration as m037 } from "./migrations/037-training-order-payurl-text";
import { migration as m038 } from "./migrations/038-training-participants";
import { migration as m039 } from "./migrations/039-training-schedule-seed";
import { migration as m040 } from "./migrations/040-training-participants-add-email";
import { migration as m041 } from "./migrations/041-supplier-qualification";
import { migration as m042 } from "./migrations/042-crm-chat-sessions";
import { migration as m043 } from "./migrations/043-invitation-codes";
import { migration as m044 } from "./migrations/044-full-team-seed";
import { migration as m045 } from "./migrations/045-user-registration-type";
import { migration as m046 } from "./migrations/046-phone-unique-index";
import { migration as m047 } from "./migrations/047-learning-material-purchases";
import { migration as m048 } from "./migrations/048-learning-materials";

/** 所有迁移（按版本号排序） */
const ALL_MIGRATIONS: Migration[] = [
  m001, m002, m003, m004, m005,
  m006, m007, m008, m009, m010, m011,
  m012, m013, m014, m015, m016, m017, m018, m019, m020, m021,
  m022, m023, m024, m025, m026, m027, m028, m029, m030, m031,
  m032, m033, m034, m035, m036,
  m037, m038, m039, m040, m041, m042, m043, m044, m045, m046, m047, m048,
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
