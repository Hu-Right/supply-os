/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import type { MembershipRepo } from "../repos/membership.repo";
import type { SuppliersRepo } from "../repos/suppliers.repo";
import type { UserRow } from "../repos/types";
import { maskPhone } from "../utils/mask";

const BCRYPT_ROUNDS = 12;

/**
 * 旧 SHA-256 哈希（仅用于兼容验证存量用户密码）
 * Legacy SHA-256 hash — only for verifying existing user passwords during migration
 */
export function hashPasswordLegacy(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/**
 * 新 bcrypt 哈希（所有新密码统一使用）
 * bcrypt hash — used for all new passwords (registration, reset, upgrade)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 双算法验证：根据 hashType 选择对应算法
 * Dual-algorithm verification: selects algorithm based on hashType
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  hashType: string,
): Promise<boolean> {
  if (hashType === "bcrypt") {
    return bcrypt.compare(password, storedHash);
  }
  // sha256 兼容验证
  return hashPasswordLegacy(password) === storedHash;
}

/**
 * 判断是否需要从旧算法升级到 bcrypt
 * Check if the password hash needs to be upgraded from legacy algorithm
 */
export function needsUpgrade(hashType: string): boolean {
  return hashType !== "bcrypt";
}

// ── 验证码哈希 ──
// 验证码存储安全：数据库中只存哈希值，明文仅用于发送短信/邮件
// SHA-256 即可（验证码一次性、6 位数字、短生命周期，无需 bcrypt）

/** 对验证码明文计算哈希（用于入库存储） */
export function hashVerificationCode(code: string): string {
  return crypto.createHash("sha256").update(`verify_code:${code}`).digest("hex");
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
  /** 已绑定手机号（脱敏显示） */
  phone: string | null;
  /** 手机号是否已验证 */
  phone_verified: number;
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
  // P3-10 性能修复：订阅查询与供应商信息查询并行化（原串行两次往返 → 一次）
  const needSupplier = Boolean(user.supplier_id) && user.supplier_link_status === "verified";
  const [hasSub, supplierRow] = await Promise.all([
    membershipRepo.hasActiveSubscription(userKey),
    needSupplier
      ? suppliersRepo.findBasicInfo(Number(user.supplier_id))
      : Promise.resolve(null),
  ]);
  const supplier = supplierRow as Record<string, unknown> | null;
  // P1-5 安全修复：统一 VIP 判定为动态计算（有效订阅），不再信任永久化字段 membership_tier
  const tier = hasSub ? "vip" : "free";
  return {
    user_key: userKey,
    email: user.email ?? "",
    display_name: user.display_name ?? "",
    membership_tier: tier,
    account_status: user.account_status ?? "pending",
    supplier_id: (supplier?.id as number) || null,
    supplier_industry_id: (supplier?.industry_id as number) || null,
    supplier_industry: (supplier?.industry as string) || null,
    phone: user.phone ? maskPhone(user.phone) : null,
    phone_verified: user.phone_verified ?? 0,
  };
}

