/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";

export function createUserPrefsRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // ── 账号默认行业偏好（本地差异 #5：偏好表 + 读写接口）──
  router.get("/api/user/industry-prefs", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原仅 trim 不 lower）
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const [rows] = await dbPool.query(
        "SELECT level1_id, level2_id, level3_id, level4_id, level5_id, updated_at FROM crm_user_industry_prefs WHERE user_key = ? LIMIT 1",
        [userKey]
      );
      res.json({ prefs: (rows as any[])[0] || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/user/industry-prefs", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原仅 trim 不 lower）
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      // 逐级取数字 id，非法值一律置 NULL；level1 为空视为清除偏好
      const levels = [1, 2, 3, 4, 5].map((n) => {
        const value = Number(req.body[`level${n}_id`] || 0);
        return Number.isInteger(value) && value > 0 ? value : null;
      });
      if (!levels[0]) {
        await dbPool.execute("DELETE FROM crm_user_industry_prefs WHERE user_key = ?", [userKey]);
        return res.json({ success: true, cleared: true });
      }
      await dbPool.execute(
        `INSERT INTO crm_user_industry_prefs (user_key, level1_id, level2_id, level3_id, level4_id, level5_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           level1_id = VALUES(level1_id), level2_id = VALUES(level2_id), level3_id = VALUES(level3_id),
           level4_id = VALUES(level4_id), level5_id = VALUES(level5_id), updated_at = NOW()`,
        [userKey, ...levels]
      );
      res.status(201).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
