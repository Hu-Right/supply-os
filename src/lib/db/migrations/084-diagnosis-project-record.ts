/**
 * 迁移 084 · 诊断「项目业绩」按「有无 + 能否举证」两问重建（2026-11-27）
 *
 * @module lib/db/migrations/084-diagnosis-project-record
 * @description 用户口径：不建业绩台账、不做结构化项目表、不要求上传，
 *              但要把「有没有海外同类业绩」和「能不能拿出证明」分开问——
 *              这两件事信息量不同（有业绩但拿不出证明是最常见的真实状态）。
 *
 *              纯加列（ensureColumn 幂等），不动存量数据：
 *              - `overseas_record`  V5 C4-1 海外同类项目业绩：无 / 仅国内 / 有海外
 *              - `record_evidence`  V5 C4-2 可提供证明：无 / 仅合同 / 合同+验收 / +业主可回访
 *
 *              旧的 `tender_experience`（近 24 个月国际公采投标履历）退役：
 *              已通过影子换表从 `supplier_diagnosis` 删除（2026-11-27，旧表归档
 *              `z_retired_supplier_diagnosis_v5`，数据快照 `z_backup_supplier_diagnosis_20261127`）。
 *              本迁移只负责把两列补到「新环境」的库里，列已存在时 ensureColumn 直接跳过。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

const TABLE = "supplier_diagnosis";

export const migration: Migration = {
  version: 84,
  name: "diagnosis_project_record",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool, TABLE, "overseas_record",
      "overseas_record VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 C4-1 海外同类项目业绩（无/仅国内/有海外）'",
    );
    await ensureColumn(
      dbPool, TABLE, "record_evidence",
      "record_evidence VARCHAR(80) NOT NULL DEFAULT '' COMMENT 'V5 C4-2 可提供证明（无/仅合同/合同+验收/+业主可回访）'",
    );
  },
};
