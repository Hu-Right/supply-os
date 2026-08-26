/**
 * 管理员鉴权守卫（Next.js 版）
 *
 * @module lib/middleware/admin
 * @description 从 server/routes/admin/middleware.ts 移植。
 *              校验 ADMIN_API_TOKEN（.env 配置）。支持两种携带方式：
 *              x-admin-token: <token> 或 Authorization: Bearer <token>。
 *              fail-closed：未配置令牌时拒绝所有请求（503）。
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * 管理员鉴权守卫。
 * @returns null 放行；NextResponse 拒绝。
 */
export function checkAdmin(req: NextRequest): NextResponse | null {
  const expected = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!expected) {
    return NextResponse.json(
      { success: false, message: "管理接口未启用：服务端未配置 ADMIN_API_TOKEN" },
      { status: 503 },
    );
  }

  const bearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const provided = String(req.headers.get("x-admin-token") || bearer || "").trim();

  const expectedBuf = crypto.createHash("sha256").update(expected).digest();
  const providedBuf = crypto.createHash("sha256").update(provided).digest();

  if (!provided || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return NextResponse.json(
      { success: false, message: "管理接口鉴权失败：令牌缺失或无效" },
      { status: 401 },
    );
  }

  return null;
}
