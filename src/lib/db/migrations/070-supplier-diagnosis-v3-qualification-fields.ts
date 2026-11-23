/**
 * 迁移 070 · 诊断 V3 第二版收集口径（2026-11-23 用户拍板）
 *
 * @module server/db/migrations/070-supplier-diagnosis-v3-qualification-fields
 * @description 与迁移 069 的差别：069 换了表（加目标市场与资质分级快照），这里只是**加列 + 改默认值**，
 *              不动表结构，故不进影子换表（ALTER 加带默认值的列在 MySQL 8 是元数据操作，秒级）。
 *
 *              V3 第二版的收集口径变化：
 *              1. 新增 `export_entity`（D1 出口主体资质）——D1 由「档案派生」改为「档案 + 本项」各半；
 *              2. D4 由「强制文件持有清单」换成两题管理能力：`cert_ledger`（台账与有效期）、
 *                 `cert_delivery`（取证时效）；
 *              3. `mandatory_docs` 不再提问，但**列保留**（AI 画像契约 diagnosisColumnSelect 仍读它），
 *                 因此必须补 DEFAULT '' —— 原列 NOT NULL 且无默认值，不补的话新版 INSERT 会直接 1451 失败。
 *
 *              幂等：逐列探测存在性；索引用 information_schema 判默认值，已是 '' 就跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "supplier_diagnosis";

async function columnExists(dbPool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column],
  );
  return Number((rows as RowDataPacket[])[0]?.n ?? 0) > 0;
}

async function columnDefault(dbPool: Pool, table: string, column: string): Promise<string | null> {
  const [rows] = await dbPool.query(
    "SELECT COLUMN_DEFAULT AS d FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column],
  );
  const row = (rows as RowDataPacket[])[0] as { d?: string | null } | undefined;
  return row?.d ?? null;
}

export const migration: Migration = {
  version: 70,
  name: "supplier_diagnosis_v3_qualification_fields",
  async up(dbPool: Pool): Promise<void> {
    const addColumn = async (column: string, ddl: string) => {
      if (await columnExists(dbPool, TABLE, column)) return;
      await dbPool.query(`ALTER TABLE \`${TABLE}\` ADD COLUMN ${ddl}`);
    };

    // 1) D1 出口主体资质（单选取值，与 DIAGNOSIS_FIELDS 的选项原文同值）
    await addColumn(
      "export_entity",
      "`export_entity` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'D1 出口主体资质（V3 新增：经营权/海关备案/外汇/退税）'",
    );

    // 2) D4 换成两题管理能力
    await addColumn(
      "cert_ledger",
      "`cert_ledger` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'D4 资质台账与有效期管理（V3 换题）'",
    );
    await addColumn(
      "cert_delivery",
      "`cert_delivery` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'D4 被要求时的取证时效（V3 换题）'",
    );

    // 3) mandatory_docs 停止写入 → 补默认值（列保留，AI 画像契约仍读）
    if (await columnExists(dbPool, TABLE, "mandatory_docs")) {
      const dflt = await columnDefault(dbPool, TABLE, "mandatory_docs");
      if (dflt === null) {
        await dbPool.query(
          "ALTER TABLE `supplier_diagnosis` MODIFY COLUMN `mandatory_docs` VARCHAR(500) NOT NULL DEFAULT '' " +
            "COMMENT 'V3 起不再询问（保留列：AI 画像契约仍读，历史值保留）'",
        );
      }
    }
  },
};
