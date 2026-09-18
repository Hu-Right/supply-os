/**
 * 080: 诊断评估表新增 phone 列
 *
 * 用途：存储提交者手机号，用于注册后回溯关联孤立诊断记录。
 * 未注册用户扫码填写诊断表时 user_id 为 null，但 phone 会持久化；
 * 后续该手机号注册后，注册流程自动回写 user_id 完成关联。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 80,
  name: "qualification-phone",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_supplier_qualification",
      "phone",
      "phone VARCHAR(20) NULL COMMENT '提交者手机号（用于注册后回溯关联）' AFTER ip",
    );
    await ensureIndex(
      dbPool,
      "crm_supplier_qualification",
      "idx_eval_phone",
      "CREATE INDEX idx_eval_phone ON crm_supplier_qualification (phone)",
    );
  },
};
