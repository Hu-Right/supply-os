/**
 * 管理员鉴权中间件
 * Admin authentication middleware
 *
 * @module server/routes/admin/middleware
 * @description 校验 ADMIN_API_TOKEN（.env 配置）。支持两种携带方式：
 *              x-admin-token: <token>  或  Authorization: Bearer <token>
 *              fail-closed：未配置令牌时拒绝所有请求（503），避免"忘配置 = 裸奔"；
 *              比对用 timingSafeEqual 防时序侧信道猜解。
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!expected) {
    res.status(503).json({ success: false, message: "管理接口未启用：服务端未配置 ADMIN_API_TOKEN" });
    return;
  }
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const provided = String(req.headers["x-admin-token"] || bearer || "").trim();
  const expectedBuf = crypto.createHash("sha256").update(expected).digest();
  const providedBuf = crypto.createHash("sha256").update(provided).digest();
  if (!provided || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    res.status(401).json({ success: false, message: "管理接口鉴权失败：令牌缺失或无效" });
    return;
  }
  next();
}
