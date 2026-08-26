/**
 * 036 - 团队成员角色徽章字段
 * Team member role badges column
 *
 * @module server/db/migrations/036-training-team-roles
 * @description 落地页讲师阵容团队头像需在头像上方展示
 *              「国际专家｜主讲老师」式角色徽章，
 *              为 training_team_members 增加可空 roles JSON 列。
 */
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 36,
  name: "036-training-team-roles",
  async up(dbPool) {
    await dbPool.query(`
      ALTER TABLE training_team_members
        ADD COLUMN roles JSON NULL AFTER title_en
    `);
  },
};
