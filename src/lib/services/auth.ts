/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import type { MembershipRepo } from "../repos/membership.repo";
import type { SupplierRegistrationRepo } from "../repos/suppliers/supplier-registration.repo";
import type { AuthRepo } from "../repos/auth.repo";
import type { UserRow } from "../repos/types";
import { maskPhone, maskName } from "../utils/mask";
import { resolveMembershipState } from "./membership-status";
import {
  signAccessToken, signRefreshToken, getRefreshTokenExpiresAt,
} from "./jwt";

const BCRYPT_ROUNDS = 12;

/** 昵称随机段字符表：去除易混淆的 I/L/O/0/1 */
const NICKNAME_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 默认昵称前缀按注册语言生成（昵称是存储值，生成后不随界面语言切换） */
const NICKNAME_PREFIXES: Record<string, string> = {
  zh: "采友",
  en: "Buyer",
  es: "Comprador",
  fr: "Acheteur",
  ru: "Закупщик",
  ar: "مشتري",
};

/**
 * 生成默认展示昵称（如"采友_K7X2" / "Buyer_K7X2"）。
 * 每位用户随机不同、不携带手机号/邮箱片段（防反推身份）；不要求唯一，身份锚点是 user_id。
 * 未知/缺省语言回退中文前缀。
 */
export function generateNickname(locale?: string): string {
  const prefix = (locale && NICKNAME_PREFIXES[locale]) || "采友";
  const bytes = crypto.randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += NICKNAME_ALPHABET[bytes[i] % NICKNAME_ALPHABET.length];
  }
  return `${prefix}_${suffix}`;
}

/**
 * 签发 JWT Token 对（登录/注册/重置密码共用，#6 自三个路由文件收口）
 * Refresh Token 哈希入库后再返回——必须 await，否则客户端在登录/注册后立即
 * 发 /api/auth/refresh 时 token 可能尚未落库，导致刷新失败（401 级联根因之一）。
 *
 * crm_users.user_key 列退役收尾：payload 以 uid 为唯一身份锚点，不再携带 user_key/email。
 */
export async function issueTokenPair(
  authRepo: AuthRepo,
  userId: number,
): Promise<{ token: string; refresh_token: string }> {
  const accessToken = signAccessToken({ uid: userId });
  const { token: refreshToken, tokenHash } = signRefreshToken({ uid: userId });
  const expiresAt = getRefreshTokenExpiresAt();
  // 同步入库（确保 hash 落库后 token 才返回），失败仅记日志不阻断：
  // token 已签发可正常使用 2h；refresh 未入库仅影响后续刷新。
  try {
    await authRepo.insertRefreshToken(userId, tokenHash, expiresAt);
  } catch (err) {
    console.error("[jwt] refresh token 入库失败:", (err as Error).message);
  }
  return { token: accessToken, refresh_token: refreshToken };
}

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
  /** 内部用户 ID */
  id: number;
  email: string;
  /** 对外展示名（昵称）。真实姓名 display_name 不进入任何 API 响应（隐私收口） */
  nickname: string;
  membership_tier: string;
  account_status: string;
  supplier_id: number | null;
  supplier_industry_id: number | null;
  supplier_industry: string | null;
  /** 已绑定手机号（脱敏显示） */
  phone: string | null;
  /** 手机号是否已验证 */
  phone_verified: number;
  /** 邮箱是否已验证 */
  email_verified: number;
}

/**
 * 组装登录/用户信息响应：查会员状态 → 查供应商 → 拼装响应
 * login 和 /api/auth/user 共用，消除重复逻辑。
 */
export async function buildUserResponse(
  user: UserRow | Partial<UserRow>,
  membershipRepo: MembershipRepo,
  registrationRepo: SupplierRegistrationRepo,
): Promise<AuthUserResponse> {
  // P3-10 性能修复：会员状态与供应商信息查询并行化（原串行两次往返 → 一次）
  const needSupplier = Boolean(user.supplier_id) && user.supplier_link_status === "verified";
  const [memberState, supplierRow] = await Promise.all([
    resolveMembershipState(membershipRepo, user.id!),
    needSupplier
      ? registrationRepo.findBasicInfo(Number(user.supplier_id))
      : Promise.resolve(null),
  ]);
  const supplier = supplierRow as Record<string, unknown> | null;
  // N1 收敛（2026-08-20）：tier 取自唯一端口 resolveMembershipState（订阅 OR 付费剩余配额 > 0），
  // 修复原"仅看订阅"口径下，仅购买单次解锁卡的用户登录态被误判为 free 的分叉问题。
  const tier = memberState.tier;
  // 展示名收口：只输出昵称。窗口期兜底（代码先上、060 回填未跑时 nickname 为 NULL）——
  // 此时以姓名掩码临时展示，回填完成后此分支自然不再命中，可在稳定后移除。
  const nickname = user.nickname || maskName(user.display_name ?? "");
  return {
    id: user.id!,
    email: user.email ?? "",
    nickname,
    membership_tier: tier,
    account_status: user.account_status ?? "pending",
    supplier_id: (supplier?.id as number) || null,
    supplier_industry_id: (supplier?.industry_id as number) || null,
    supplier_industry: (supplier?.industry as string) || null,
    phone: user.phone ? maskPhone(user.phone) : null,
    phone_verified: user.phone_verified ?? 0,
    email_verified: user.email_verified ?? 0,
  };
}

