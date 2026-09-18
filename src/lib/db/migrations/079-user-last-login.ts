/**
 * 079: 用户最后登录时间
 * user-last-login
 *
 * 为 crm_users 新增 last_login_at 列，记录用户最近一次登录时间。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 79,
  name: "user-last-login",
  async up(dbPool: Pool) {
    await ensureColumn(
      dbPool,
      "crm_users",
      "last_login_at",
      "last_login_at DATETIME NULL COMMENT '最近登录时间' AFTER updated_at",
    );
  },
};
