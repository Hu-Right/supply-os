/**
 * 迁移 074 · 诊断执行清单勾选状态（2026-11-24）
 *
 * @module lib/db/migrations/074-supplier-diagnosis-checklist-state
 * @description 资质板块要从"报告"变成"可执行清单"：后台按每条准入要求生成待办/证据包，
 *              运营勾完一条记一条。状态单独存一列，不掺进 qual_breakdown 快照——
 *              快照是提交时的只读事实，勾选是运营过程数据，两者生命周期不同。
 *
 *              形状：{ "<market>|<standard>": { done, note, owner, due } }
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "supplier_diagnosis";

export const migration: Migration = {
  version: 74,
  name: "supplier_diagnosis_checklist_state",
  async up(dbPool: Pool): Promise<void> {
    const [rows] = await dbPool.query(
      "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'checklist_state'",
      [TABLE],
    );
    const exists = Number((rows as { n?: number }[])[0]?.n ?? 0) > 0;
    if (!exists) {
      await dbPool.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`checklist_state\` JSON DEFAULT NULL ` +
          "COMMENT '执行清单勾选状态（V3）：{\"市场|标准\":{done,note,owner,due}}'",
      );
    }
  },
};
