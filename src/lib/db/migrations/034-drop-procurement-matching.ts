/**
 * 迁移 034 · 下线发布后自动匹配/邀约
 *
 * @module server/db/migrations/034-drop-procurement-matching
 * @description 产品决定：发布只展示成功，候选匹配与邀约由采购方线下自行处理。
 *              删除 `procurement_invitations`（先删，因引用 matches/supplier）与
 *              `procurement_matches`；旧 revision / tender 数据不依赖这两张表。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 34,
  name: "drop_procurement_matching",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query("DROP TABLE IF EXISTS `procurement_invitations`");
    await dbPool.query("DROP TABLE IF EXISTS `procurement_matches`");
  },
};
