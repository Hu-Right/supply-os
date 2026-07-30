/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { hashPassword } from "../services/auth";

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // 6a. GET CERTIFICATIONS
  router.post("/api/auth/register", async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const displayName = String(req.body.display_name || email.split("@")[0] || "\u4f1a\u5458");
      if (!email || !password) return res.status(400).json({ error: "邮箱和密码不能为空" });
      if (password.length < 6) return res.status(400).json({ error: "密码至少 6 位" });

      await dbPool.execute(
        `INSERT INTO crm_users (user_key, email, display_name, password_hash, membership_tier, account_status)
         VALUES (?, ?, ?, ?, 'free', 'pending')
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash), updated_at = NOW()`,
        [email, email, displayName, hashPassword(password)]
      );

      res.status(201).json({
        success: true,
        user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const [rows] = await dbPool.query(
        "SELECT user_key, email, display_name, password_hash, membership_tier, account_status, supplier_id, supplier_link_status FROM crm_users WHERE user_key = ? LIMIT 1",
        [email]
      );
      const user = (rows as any[])[0];
      if (!user || user.password_hash !== hashPassword(password)) {
        return res.status(401).json({ error: "账号或密码错误" });
      }
      if (user.account_status === "disabled" || user.account_status === "rejected") {
        return res.status(403).json({ error: "账号未通过审核或已停用" });
      }
      const [subs] = await dbPool.query(
        "SELECT id FROM crm_user_subscriptions WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [email]
      );
      let supplier: any = null;
      if (user.supplier_id && user.supplier_link_status === "verified") {
        const [supplierRows] = await dbPool.query(
          "SELECT id, industry_id, industry FROM crm_suppliers WHERE id = ? LIMIT 1",
          [user.supplier_id]
        );
        supplier = (supplierRows as any[])[0] || null;
      }
      const tier = (subs as any[]).length > 0 ? "vip" : user.membership_tier || "free";
      res.json({
        success: true,
        user: {
          user_key: user.user_key,
          email: user.email,
          display_name: user.display_name,
          membership_tier: tier,
          account_status: user.account_status || "pending",
          supplier_id: supplier?.id || null,
          supplier_industry_id: supplier?.industry_id || null,
          supplier_industry: supplier?.industry || null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/auth/user", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [rows] = await dbPool.query(
        "SELECT user_key, email, display_name, membership_tier, account_status, supplier_id, supplier_link_status FROM crm_users WHERE user_key = ? LIMIT 1",
        [userKey]
      );
      const user = (rows as any[])[0];
      if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

      const [subs] = await dbPool.query(
        "SELECT id FROM crm_user_subscriptions WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [userKey]
      );
      let supplier: any = null;
      if (user.supplier_id && user.supplier_link_status === "verified") {
        const [supplierRows] = await dbPool.query(
          "SELECT id, industry_id, industry FROM crm_suppliers WHERE id = ? LIMIT 1",
          [user.supplier_id]
        );
        supplier = (supplierRows as any[])[0] || null;
      }
      const tier = (subs as any[]).length > 0 ? "vip" : user.membership_tier || "free";

      res.json({
        success: true,
        user: {
          user_key: user.user_key,
          email: user.email,
          display_name: user.display_name,
          membership_tier: tier,
          account_status: user.account_status || "pending",
          supplier_id: supplier?.id || null,
          supplier_industry_id: supplier?.industry_id || null,
          supplier_industry: supplier?.industry || null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
