/**
 * 035 - 团队成员头衔字段
 * Team member title columns
 *
 * @module server/db/migrations/035-training-team-titles
 * @description 落地页讲师阵容团队头像网格需展示头衔，
 *              为 training_team_members 增加可空 title_zh / title_en 列。
 */
import "server-only";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 35,
  name: "035-training-team-titles",
  async up(dbPool) {
    await dbPool.query(`
      ALTER TABLE training_team_members
        ADD COLUMN title_zh VARCHAR(200) NULL AFTER name_en,
        ADD COLUMN title_en VARCHAR(200) NULL AFTER title_zh
    `);
  },
};
