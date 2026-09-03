/** POST /api/auth/rebind-phone — 换绑手机号（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { hashVerificationCode } from "@/lib/services/auth";
import { maskPhone } from "@/lib/utils/mask";

const PHONE_RE = /^1[3-9]\d{9}$/;

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { new_phone, code } = await req.json();
  if (!new_phone || !PHONE_RE.test(new_phone)) return NextResponse.json({ code: 40011, message: "请输入有效的手机号" }, { status: 400 });
  if (!code) return NextResponse.json({ code: 40005, message: "请输入验证码" }, { status: 400 });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });
  if (!user.phone) return NextResponse.json({ code: 40030, message: "尚未绑定手机号" }, { status: 400 });

  const record = await ctx.user.authRepo.findLatestActiveCode(user.id, "phone_rebind", new_phone);
  if (!record) return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  if (record.attempts >= 5) return NextResponse.json({ code: 40029, message: "尝试次数过多" }, { status: 429 });
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  }

  const existingByPhone = await ctx.user.usersRepo.findByPhone(new_phone);
  if (existingByPhone && existingByPhone.user_key !== auth.userKey) {
    return NextResponse.json({ code: 40032, message: "该手机号已被其他用户绑定" }, { status: 409 });
  }
  await ctx.user.usersRepo.bindPhone(auth.userKey, new_phone);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true, phone: maskPhone(new_phone) });
}
