/**
 * 迁移 054 — 「解锁」命名清理：opportunity_unlocks → notice_access_grants
 *
 * @description 解锁动作自 2026-10-29 起对用户不可见（会员打开公告即自动留痕），
 *              `opportunity_unlocks` 实质是「公告/商机访问授权流水」，继续沿用 unlock
 *              命名会误导维护。本次做**纯重命名**，不动数据、不动索引结构：
 *
 *              - 表：opportunity_unlocks → notice_access_grants
 *              - 列：unlock_type → grant_type、unlocked_at → granted_at
 *              - 表注释同步为「访问授权流水（含公告与商机）」
 *
 *              MySQL 8.0.46：RENAME TABLE / RENAME COLUMN 均为元数据操作，秒级完成；
 *              幂等：按 information_schema 判断旧表/旧列是否还存在，已迁移则跳过。
 *              空库 bootstrap 走基线新名（旧表不存在 → 直接跳过）。
 *
 *              注意：该表仍是**付费/授权凭证**（grant_type、price、历史 free 记录），
 *              重命名只解决命名，不改变访问判定语义（见 resolveNoticeAccess）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const OLD_TABLE = "opportunity_unlocks";
const NEW_TABLE = "notice_access_grants";

async function hasTable(dbPool: Pool, table: string): Promise<boolean> {
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function hasColumn(dbPool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

export const migration: Migration = {
  version: 54,
  name: "notice-access-grants-rename",

  async up(dbPool: Pool): Promise<void> {
    const [oldExists, newExists] = await Promise.all([
      hasTable(dbPool, OLD_TABLE),
      hasTable(dbPool, NEW_TABLE),
    ]);

    if (!oldExists && !newExists) {
      console.log("[migration 054] 新旧表均不存在（空库基线已用新名），跳过");
      return;
    }

    if (oldExists) {
      console.log(`[migration 054] RENAME TABLE ${OLD_TABLE} → ${NEW_TABLE}`);
      await dbPool.query(`RENAME TABLE \`${OLD_TABLE}\` TO \`${NEW_TABLE}\``);
    } else {
      console.log(`[migration 054] ${NEW_TABLE} 已存在（迁移已完成），仅核对列名`);
    }

    // 列重命名：逐列判断，避免半迁移状态重复执行报错
    const [hasOldType, hasOldAt] = await Promise.all([
      hasColumn(dbPool, NEW_TABLE, "unlock_type"),
      hasColumn(dbPool, NEW_TABLE, "unlocked_at"),
    ]);
    if (hasOldType && hasOldAt) {
      console.log(`[migration 054] RENAME COLUMN unlock_type → grant_type, unlocked_at → granted_at`);
      await dbPool.query(
        `ALTER TABLE \`${NEW_TABLE}\`
           RENAME COLUMN \`unlock_type\` TO \`grant_type\`,
           RENAME COLUMN \`unlocked_at\` TO \`granted_at\``,
      );
    } else if (hasOldType || hasOldAt) {
      // 半迁移：逐列补齐（异常中断后重跑）
      if (hasOldType) {
        await dbPool.query(
          `ALTER TABLE \`${NEW_TABLE}\` RENAME COLUMN \`unlock_type\` TO \`grant_type\``,
        );
      }
      if (hasOldAt) {
        await dbPool.query(
          `ALTER TABLE \`${NEW_TABLE}\` RENAME COLUMN \`unlocked_at\` TO \`granted_at\``,
        );
      }
    }

    // 表注释：与基线同文（纯元数据）
    await dbPool.query(
      `ALTER TABLE \`${NEW_TABLE}\` COMMENT = '公告/商机访问授权流水（原 opportunity_unlocks：会员打开即自动留痕；grant_type/price 为历史付费凭证）'`,
    );

    // 迁移后自检：新表必须存在、旧列必须消失
    const [finalNew, finalOldType] = await Promise.all([
      hasTable(dbPool, NEW_TABLE),
      hasColumn(dbPool, NEW_TABLE, "unlock_type"),
    ]);
    if (!finalNew || finalOldType) {
      throw new Error("[migration 054] 重命名后校验失败：notice_access_grants 不存在或 unlock_type 仍在");
    }
    console.log("[migration 054] 完成：notice_access_grants(grant_type, granted_at)");
  },
};
