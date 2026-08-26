/** POST /api/auth/unbind-phone — 解绑手机号（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { hashVerificationCode } from "@/lib/services/auth";

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { code } = await req.json();
  if (!code) return NextResponse.json({ code: 40005, message: "请输入验证码" }, { status: 400 });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });
  if (!user.phone) return NextResponse.json({ code: 40030, message: "尚未绑定手机号" }, { status: 400 });

  const record = await ctx.user.authRepo.findLatestActiveCode(auth.userKey, "phone_unbind", user.phone);
  if (!record) return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  }

  await ctx.user.usersRepo.unbindPhone(auth.userKey);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true });
}
