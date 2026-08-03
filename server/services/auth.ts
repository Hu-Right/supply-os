/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import type { MembershipRepo } from "../repos/membership.repo";
import type { SuppliersRepo } from "../repos/suppliers.repo";
import type { UserRow } from "../repos/types";

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/** 登录/用户信息公共响应体 */
export interface AuthUserResponse {
  user_key: string;
  email: string;
  display_name: string;
  membership_tier: string;
  account_status: string;
  supplier_id: number | null;
  supplier_industry_id: number | null;
  supplier_industry: string | null;
}

/**
 * 组装登录/用户信息响应：查订阅 → 查供应商 → 计算 tier → 拼装响应
 * login 和 /api/auth/user 共用，消除重复逻辑。
 */
export async function buildUserResponse(
  user: UserRow | Partial<UserRow>,
  membershipRepo: MembershipRepo,
  suppliersRepo: SuppliersRepo,
): Promise<AuthUserResponse> {
  const userKey = user.user_key ?? "";
  const hasSub = await membershipRepo.hasActiveSubscription(userKey);
  let supplier: Record<string, unknown> | null = null;
  if (user.supplier_id && user.supplier_link_status === "verified") {
    supplier = (await suppliersRepo.findBasicInfo(Number(user.supplier_id))) as Record<string, unknown> | null;
  }
  const tier = hasSub ? "vip" : user.membership_tier || "free";
  return {
    user_key: userKey,
    email: user.email ?? "",
    display_name: user.display_name ?? "",
    membership_tier: tier,
    account_status: user.account_status ?? "pending",
    supplier_id: (supplier?.id as number) || null,
    supplier_industry_id: (supplier?.industry_id as number) || null,
    supplier_industry: (supplier?.industry as string) || null,
  };
}

