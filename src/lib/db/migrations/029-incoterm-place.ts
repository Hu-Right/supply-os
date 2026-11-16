/**
 * 迁移 029 · Incoterms 指定地点
 *
 * @module server/db/migrations/029-incoterm-place
 * @description 贸易术语必须带指定地点/港口（FOB Shanghai、DDP Nairobi），
 *              否则只有 FOB/CIF 无法确定运费与风险转移点。新增 incoterm_place。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 29,
  name: "incoterm_place",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "incoterm_place",
      "incoterm_place varchar(120) DEFAULT NULL COMMENT 'Incoterms 指定地点/港口（如 Shanghai / 上海港）；与 incoterm + version 配套'",
    );
  },
};
