/**
 * 登录编排服务（架构评估 A4：自 auth/login 路由下沉）
 *
 * @module lib/services/auth-login
 * @description 收口"密码登录"的多仓库编排：凭据校验（含恒时防时序）、
 *              弱哈希账号重置闸门、账号状态闸门、用户载荷构建、Token 签发。
 *              路由层只保留：限流、请求解析、Refresh Cookie 写入。
 *              业务失败以 RouteError（lib 级业务错误，含 status/code 元数据）抛出。
 */
import type { AppContext } from "../db/context";
import { RouteError } from "../middleware/route-handler";
import { EC_AUTH_REQUIRED, EC_PASSWORD_RESET_REQUIRED } from "@/shared/constants/api";
import { verifyPassword, buildUserResponse, issueTokenPair } from "./auth";

// 恒时验证用的固定 bcrypt 哈希（对应用户不存在时的时序攻击防护）
const DUMMY_BCRYPT_HASH = "$2b$12$AAAAAAAAAAAAAAAAAAAAAAOqGHn2kLJ3xQ4y5m6n7p8r9s0t1u2v3w";

export interface LoginPasswordResult {
  /** 脱敏后的用户载荷（buildUserResponse 收口） */
  payload: Awaited<ReturnType<typeof buildUserResponse>>;
  /** JWT_SECRET 未配置时为 null（静默降级为无 Token 登录） */
  accessToken: string | null;
  refreshToken: string | null;
}

/** 密码登录编排：校验 + 重置闸门 + 状态闸门 + 载荷 + Token 签发 */
export async function loginWithPassword(
  ctx: AppContext,
  params: { identifier: string; password: string },
): Promise<LoginPasswordResult> {
  const { identifier, password } = params;

  const user = await ctx.user.usersRepo.findAuthByIdentifier(identifier);

  if (!user || !user.password_hash) {
    // 恒时验证防时序攻击
    await verifyPassword(password || "", DUMMY_BCRYPT_HASH);
    throw new RouteError(401, EC_AUTH_REQUIRED, "账号或密码错误");
  }
  // SHA-256 弱哈希已退役：不再校验旧密码，存量账号一律引导先重置。
  // 重置成功写入 bcrypt 后自然恢复登录；403 语义避开 api-client 401 刷新重试路径。
  if (user.password_hash_type !== "bcrypt") {
    throw new RouteError(
      403,
      EC_PASSWORD_RESET_REQUIRED,
      "为保障账号安全，请先通过「忘记密码」设置新密码后再登录",
    );
  }
  if (!(await verifyPassword(password || "", user.password_hash))) {
    throw new RouteError(401, EC_AUTH_REQUIRED, "账号或密码错误");
  }
  if (user.account_status === "disabled" || user.account_status === "rejected") {
    throw new RouteError(403, 40003, "账号未通过审核或已停用");
  }

  await ctx.user.usersRepo.updateLastLoginById(user.id);

  const payload = await buildUserResponse(user, ctx.benefitSystemRepo, ctx.supplier.directoryRepo);
  let tokens: { token: string; refresh_token: string } | null = null;
  try {
    tokens = await issueTokenPair(ctx.user.authRepo, user.id);
  } catch { /* JWT_SECRET 未配置，静默降级 */ }

  return {
    payload,
    accessToken: tokens?.token ?? null,
    refreshToken: tokens?.refresh_token ?? null,
  };
}
