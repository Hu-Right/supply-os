/**
 * POST /api/auth/check-email-phone — 检查邮箱是否绑定手机号
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { maskPhone } from "@/lib/utils/mask";

const checkSchema = z.object({
  email: z
    .string({ error: "请输入有效的邮箱地址" })
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "请输入有效的邮箱地址"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const { email } = await parseJson(req, checkSchema, { email: 40010 });
  // 分情况查重（user_key 列退役前置）：邮箱场景按 email 列查找，不再依赖已废弃的 user_key
  const user = await getContext().user.usersRepo.findByEmail(email);
  if (!user || !user.phone || !user.phone_verified) {
    return NextResponse.json({ has_phone: false });
  }
  return NextResponse.json({ has_phone: true, phone: maskPhone(user.phone) });
});
