/**
 * 094: 退役并删除旧权益三表（阶段二 · 蓝绿切换收口）
 * drop-old-benefit-tables
 *
 * @description 092 旁路新建权益正式表组（8 张）后，服务层读路径已切到新表；
 *   生产环境已完成切换（用户 2026-09-23 确认）。本迁移删除 092 头注释所定义的
 *   「旧三表」：crm_membership_plans / crm_user_subscriptions / crm_user_entitlements。
 *   全库检索确认：运行时代码（repos/services/features）对旧三表既无写入也无读取，
 *   旧表名仅残留于历史迁移脚本内（054/056/058/066/090，属一次性迁移，正常保留）。
 *
 *   安全前置（把"人工闸口"写进代码，防误删）：
 *   1) 新表组必须已建（以 crm_plan_catalog 为哨兵）——否则直接 throw 拒绝执行，
 *      杜绝"新表还没建就删旧表"的灾难顺序；
 *   2) 逐表探测存在性后直接 DROP，重跑不报错（幂等）。
 *
 *   回滚保险：不在迁移内落备份表，改由**外部快照**承担——执行本迁移前必须先跑
 *   scripts/backup-before-v2.mjs（第一把闸，导出 DDL + 全量行 + 恢复 SQL）或对目标库
 *   做一次物理快照。回滚时用快照恢复旧三表，并从 schema_migrations 删除 version=94 行。
 *
 *   外键：旧三表均以普通列 + KEY 建索引，彼此及对 crm_users 都无 FOREIGN KEY 关系；
 *   crm_payment_orders.plan_code 为字符串流水（090 已确认保留订单历史），删套餐行不影响其查询。
 *   故 DROP 不被任何外键阻断。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** 092 定义的旧三表（删除顺序：子→父语义清晰，实际无 FK 约束） */
const LEGACY_TABLES = [
  "crm_user_entitlements",
  "crm_user_subscriptions",
  "crm_membership_plans",
] as const;

/** 新表组哨兵：证明阶段一建表 + 阶段二切换的前置已就位 */
const SENTINEL_NEW_TABLE = "crm_plan_catalog";

async function tableExists(dbPool: Pool, table: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Number((rows as RowDataPacket[])[0]?.total || 0) > 0;
}

export const migration: Migration = {
  version: 94,
  name: "094-drop-old-benefit-tables",
  async up(dbPool: Pool) {
    // 前置闸：新表组未就位则拒绝删旧表（蓝绿切换顺序不可颠倒）
    if (!(await tableExists(dbPool, SENTINEL_NEW_TABLE))) {
      throw new Error(
        `[migration-094] 新权益表 ${SENTINEL_NEW_TABLE} 不存在，禁止删除旧三表（先确认 092 已执行、服务层已切读）`,
      );
    }

    for (const table of LEGACY_TABLES) {
      if (!(await tableExists(dbPool, table))) {
        console.log(`[migration-094] ${table} 已不存在，跳过（幂等重跑）`);
        continue;
      }
      await dbPool.query(`DROP TABLE \`${table}\``);
      console.log(`[migration-094] 已删除旧表 ${table}`);
    }

    console.log("[migration-094] 旧权益三表退役完成（回滚依赖执行前的外部快照）");
  },
};
