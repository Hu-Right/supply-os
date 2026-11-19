/**
 * 迁移 058 · 退役 notice_public.difficulty
 *
 * @description 2026-11-19：源表 bid_notices.difficulty 全站零读取（前端难度展示早已收敛到
 *              registration_level），该列在服务表里同样只是搬运，故一并退役。
 *              服务表由 build.ts 唯一写入，PUBLIC_COLS 已同步移除该列；本迁移只做 DDL 收尾。
 *
 *              notice_public 无 FULLTEXT 索引，DROP COLUMN 走 ALGORITHM=INSTANT（元数据级，秒完）。
 *              幂等：列不存在时直接跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 58,
  name: "drop_notice_public_difficulty",
  async up(dbPool: Pool): Promise<void> {
    const [rows] = await dbPool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notice_public' AND COLUMN_NAME = 'difficulty'`,
    );
    if ((rows as RowDataPacket[]).length === 0) return;
    await dbPool.query("ALTER TABLE `notice_public` DROP COLUMN `difficulty`, ALGORITHM=INSTANT");
    console.log("[migration 058] 已退役 notice_public.difficulty");
  },
};