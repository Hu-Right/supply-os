/** POST /api/auth/bind-email — 绑定邮箱（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { hashVerificationCode } from "@/lib/services/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { email, code } = await req.json();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ code: 40010, message: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (!code) return NextResponse.json({ code: 40005, message: "请输入验证码" }, { status: 400 });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });
  if (user.email) return NextResponse.json({ code: 40031, message: "已绑定邮箱，请先解绑" }, { status: 409 });

  const targetEmail = email.trim().toLowerCase();
  const record = await ctx.user.authRepo.findLatestActiveCode(user.id, "email_bind", targetEmail);
  if (!record) return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  if (record.attempts >= 5) return NextResponse.json({ code: 40029, message: "尝试次数过多" }, { status: 429 });
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  }

  // 检查邮箱是否已被其他用户绑定
  const existingByEmail = await ctx.user.usersRepo.findByEmail(targetEmail);
  if (existingByEmail && existingByEmail.user_key !== auth.userKey) {
    return NextResponse.json({ code: 40032, message: "该邮箱已被其他用户绑定" }, { status: 409 });
  }

  await ctx.user.usersRepo.bindEmail(auth.userKey, targetEmail);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true, email: targetEmail });
}
