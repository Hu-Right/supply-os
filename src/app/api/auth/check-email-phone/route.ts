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
  // 按 user_key（登录凭据）查找——历史用户 user_key = 小写邮箱
  const user = await getContext().user.usersRepo.findByKey(email);
  if (!user || !user.phone || !user.phone_verified) {
    return NextResponse.json({ has_phone: false });
  }
  return NextResponse.json({ has_phone: true, phone: maskPhone(user.phone) });
});
