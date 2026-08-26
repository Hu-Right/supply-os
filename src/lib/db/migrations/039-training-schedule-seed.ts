/**
 * 039: 研修班期次数据初始化
 * Training schedule seed data
 *
 * @description 插入 3 期研修班期次数据：
 *              - 第 1 期：2026-07-20（已截止）
 *              - 第 2 期：2026-08-20（已截止）
 *              - 第 3 期：2026-09-20（报名中）
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 39,
  name: "training-schedule-seed",
  async up(dbPool: Pool) {
    // 先查询课程 ID（假设课程已存在）
    const [courseRows] = await dbPool.query(
      "SELECT id FROM training_courses WHERE status = 'active' LIMIT 1"
    );
    const courseId = (courseRows as { id: number }[])[0]?.id;

    if (!courseId) {
      console.warn("[migration-039] 未找到活跃课程，跳过期次数据插入");
      return;
    }

    // 检查是否已有期次数据
    const [countRows] = await dbPool.query(
      "SELECT COUNT(*) AS total FROM training_schedules WHERE course_id = ?",
      [courseId]
    );
    const total = Number((countRows as { total: number }[])[0]?.total || 0);

    if (total > 0) {
      console.log("[migration-039] 期次数据已存在，跳过");
      return;
    }

    // 插入 3 期数据
    await dbPool.execute(
      `INSERT INTO training_schedules
        (course_id, period_number, start_date, city, format, status, capacity)
      VALUES
        (?, 1, '2026-07-20', '杭州', '线下', 'closed', 30),
        (?, 2, '2026-08-20', '杭州', '线下', 'closed', 30),
        (?, 3, '2026-09-20', '杭州', '线下', 'open', 30)`,
      [courseId, courseId, courseId]
    );

    console.log("[migration-039] 研修班期次数据插入完成（3 期）");
  },
};
