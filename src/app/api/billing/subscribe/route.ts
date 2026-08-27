/**
 * 管理员 VIP 开通路由
 * Admin VIP subscription activation route
 *
 * @module app/api/billing/subscribe/route
 * @description 从 Express routes/payment.routes.ts 迁移。
 *              管理员通过 API Token 为用户开通 VIP 会员。
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { activateSubscription } from "@/lib/payment/fulfillment";

/** 常数时间比较管理员密钥（防时序侧信道逐字节探测） */
function isAdminKeyValid(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── 错误码定义 ──
const ApiErrorCode = {
  ADMIN_AUTH_REQUIRED: 40301,
  USER_REQUIRED: 40001,
  PLAN_NOT_FOUND: 40401,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json(
    { code, message, error: message },
    { status },
  );
}

// ── POST /api/billing/subscribe — 管理员开通 VIP ──
export async function POST(req: NextRequest) {
  // P1-4 安全修复：billing/subscribe 需要管理员密钥，防止免费开通 VIP
  const body = await req.json();
  const adminKey = String(body.admin_key || req.headers.get("x-admin-key") || "");
  const expectedAdminKey = process.env.ADMIN_API_TOKEN || "";

  if (!isAdminKeyValid(adminKey, expectedAdminKey)) {
    return sendError("此端点需要管理员密钥", 403, ApiErrorCode.ADMIN_AUTH_REQUIRED);
  }

  const userKey = String(body.user_key || "").trim().toLowerCase().slice(0, 190);
  const planCode = String(body.plan_code || "single");

  if (!userKey) {
    return sendError("请先登录", 400, ApiErrorCode.USER_REQUIRED);
  }

  const ctx = getContext();
  const { paymentsRepo, membershipRepo } = ctx.payment;

  // 套餐以 crm_membership_plans 为唯一事实源：不存在/已下架时 404
  const result = await activateSubscription(paymentsRepo, membershipRepo, { userKey, planCode });
  if (!result) {
    return sendError("套餐不存在", 404, ApiErrorCode.PLAN_NOT_FOUND);
  }

  return NextResponse.json(
    {
      success: true,
      plan_code: planCode,
      price: result.price,
      quota: result.quota,
      membership_tier: "vip",
    },
    { status: 201 },
  );
}
