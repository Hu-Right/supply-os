/**
 * 后台运维功能访问门禁（轻量 admin 判定）
 * Lightweight admin gate for ops features
 *
 * @module lib/services/admin-access
 * @description supply-os 没有角色体系，运维入口（公告打标等花钱/写生产数据的功能）
 *              用环境变量白名单把门：ADMIN_EMAILS 配管理员邮箱（逗号分隔，大小写不敏感）。
 *              未配置 = 全员拒绝（fail-closed），并在错误信息里指出该怎么配。
 *              判定按「登录 userId → 查邮箱 → 命中白名单」三步，不引入新表。
 */
import { NextRequest } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { RouteError } from "@/lib/middleware/route-handler";

function adminEmailList(): string[] {
  return String(process.env.ADMIN_EMAILS || "")
    .split(/[,，;；、\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** userId 是否命中 ADMIN_EMAILS 白名单（未配置一律 false） */
export async function isAdminUserId(userId: number): Promise<boolean> {
  const list = adminEmailList();
  if (list.length === 0 || !Number.isInteger(userId) || userId <= 0) return false;
  const [rows] = await getPool().query(`SELECT email FROM crm_users WHERE id = ? LIMIT 1`, [userId]);
  const email = String((rows as Array<{ email?: string }>)[0]?.email ?? "").toLowerCase();
  return email !== "" && list.includes(email);
}

/** admin API 守卫：未登录 401；已登录但不在白名单 403（含配置指引）。通过则返回 userId。 */
export async function requireAdminOrThrow(req: NextRequest): Promise<number> {
  const auth = await requireUserKeyOrThrow(req);
  if (!(await isAdminUserId(auth.userId))) {
    const configured = adminEmailList().length > 0;
    throw new RouteError(
      403,
      40043,
      configured
        ? "无后台运维权限（当前账号不在 ADMIN_EMAILS 白名单）"
        : "后台运维功能未开放：请在运行环境 .env 配置 ADMIN_EMAILS=管理员邮箱（逗号分隔）后重启",
    );
  }
  return auth.userId;
}
