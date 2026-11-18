/**
 * 迁移 049 — 用户手机号统一 E.164
 *
 * @module server/db/migrations/049-phone-e164
 * @description 2026-11-18 起手机号放开到全球（含港澳台）：`users.phone` 的存储口径
 *              统一为 E.164（`+8613800138000` / `+85291234567`）。
 *
 *              本迁移只把存量的「大陆 11 位」补上 +86 前缀，不改列结构：
 *              - 幂等：已带 `+` 的号码不会被再次命中（正则只匹配纯 11 位）；
 *              - 可回滚：回滚只需 `REGEXP '^\\+86'` 去掉前缀（见 down 说明）；
 *              - 唯一键 `uk_phone` 保持不变，E.164 天然全局唯一。
 *
 *              发布顺序要求：本迁移必须与应用代码同批上线 —— 登录/找回按 E.164
 *              查库，只迁移不改代码（或反之）都会让存量账号登录失败。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 49,
  name: "phone_e164",
  async up(dbPool: Pool): Promise<void> {
    const [before] = await dbPool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM users WHERE phone REGEXP '^1[3-9][0-9]{9}$'",
    );
    const pending = Number(before[0]?.n || 0);
    if (pending === 0) return;

    await dbPool.query(
      "UPDATE users SET phone = CONCAT('+86', phone) WHERE phone REGEXP '^1[3-9][0-9]{9}$'",
    );
    console.log(`[migration 049] 已把 ${pending} 个大陆手机号补全为 E.164`);
  },
};
