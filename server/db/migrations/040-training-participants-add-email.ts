/**
 * 040: 学员表新增 email 字段
 * training_participants add email column
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 40,
  name: "training-participants-add-email",
  async up(dbPool: Pool) {
    await dbPool.query(`
      ALTER TABLE training_participants
      ADD COLUMN email VARCHAR(200) NULL COMMENT '邮箱' AFTER position
    `);
    console.log("[migration-040] training_participants.email 列添加完成");
  },
};
