/**
 * 系统配置公开端点
 * Public system config endpoints (no auth required)
 *
 * @module routes/system.routes
 */
import { Router } from "express";
import type { AppContext } from "../context";

export function createSystemRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // 获取 ICP 备案号（公开接口，前端 Footer 展示用）
  router.get("/api/system/icp", async (_req, res) => {
    try {
      const [rows] = await dbPool.query(
        `SELECT bah FROM system LIMIT 1`
      );
      const bah = (rows as any[])?.[0]?.bah || "";
      res.json({ bah });
    } catch {
      res.json({ bah: "" });
    }
  });

  return router;
}
