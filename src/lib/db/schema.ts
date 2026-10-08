/**
 * Schema 迁移入口
 * Schema migration entry point
 *
 * @module server/db/schema
 * @description 迁移机制保留可用，但纪律是**非必要不写迁移**：结构以生产库当前状态为事实源，
 *              只有需要长期保真、可回放、跨环境一致的变更（新表、关键列、约束、值域）才落成
 *              迁移文件。一次性数据修补、临时排查、单字段小默认值调整走运维脚本直接对库执行，
 *              不进本链——迁太多反而没人能判断哪条还在生效。
 *
 *              历史：原 107 个迁移已于 2026-09-29 清空，全库结构快照与历史迁移代码本体都在
 *              docs/数据库设计/_baseline-20260929/（schema-all-tables.sql / migrations-full.zip）。
 *              【账本状态】生产库 schema_migrations 原有的 106 行旧记录已于 2026-10-08 清空
 *              （全量备份：docs/数据库设计/_baseline-20260929/backup-schema-migrations-before-clear
 *              .json / .sql，逐条 INSERT 可回滚），因此**新迁移从 version 001 起写**。
 *              历史 107 个迁移**不回灌**：其中不少表走过影子表切换，用迁移链已推导不出生产现状，
 *              重放只会破库；结构事实源是库本身 + 快照目录。
 *              （runner 的判定是 pending = 未出现在账本里的版本，撞号仍会被**静默跳过**。）
 */
import type { Pool } from "mysql2/promise";
import { runMigrations, type Migration } from "./migrations/runner";

/** 迁移清单：非必要不写。新增迁移 = 放进 migrations/ 并 push 到本数组。 */
const ALL_MIGRATIONS: Migration[] = [];

/**
 * 执行所有待应用的 schema 迁移。
 * @returns 本次执行的迁移数量（当前为 0，行为等价于「不迁移」）
 */
export async function ensureProcurementSchema(dbPool: Pool): Promise<number> {
  return runMigrations(dbPool, ALL_MIGRATIONS);
}
