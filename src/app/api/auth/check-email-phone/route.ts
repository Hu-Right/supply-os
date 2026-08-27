/**
 * POST /api/auth/check-email-phone — 检查邮箱是否绑定手机号
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { maskPhone } from "@/server/utils/mask";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  const addr = String(email || "").trim().toLowerCase();
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    return NextResponse.json({ code: 40010, message: "请输入有效的邮箱地址" }, { status: 400 });
  }
  const user = await getContext().user.usersRepo.findByKey(addr);
  if (!user || !user.phone || !user.phone_verified) {
    return NextResponse.json({ has_phone: false });
  }
  return NextResponse.json({ has_phone: true, phone: maskPhone(user.phone) });
}
