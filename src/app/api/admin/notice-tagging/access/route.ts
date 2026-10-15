/**
 * GET /api/admin/notice-tagging/access — 当前登录账号是否具备后台运维权限
 * @description 供设置区导航做「公告打标 / 公告管理」菜单项的显隐判定（ADMIN_EMAILS 白名单）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { isAdminUserId } from "@/lib/services/admin-access";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  return NextResponse.json({ admin: await isAdminUserId(auth.userId) });
});
