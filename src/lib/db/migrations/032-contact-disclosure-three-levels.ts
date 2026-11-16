/**
 * 迁移 032 · 采购方信息公开范围收敛为三档
 *
 * @module server/db/migrations/032-contact-disclosure-three-levels
 * @description 公开页从未下发联系人，`org_contact` 是空承诺；统一改为：
 *              none / org_only / budget_all。存量 org_contact 归并为 org_only。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 32,
  name: "contact_disclosure_three_levels",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      "UPDATE procurement_projects SET contact_disclosure = 'org_only' WHERE contact_disclosure = 'org_contact'",
    );
  },
};
