/**
 * 两步验证（TOTP）业务编排
 *
 * @module lib/services/mfa
 * @description 账号级开关：绑定 / 启用 / 校验 / 关闭。
 *              安全口径：密钥加密落库；动态码 ±1 窗口；同一时间步不可重放；
 *              恢复码一次性（哈希数组，使用后移除）；失败计数用于审计与限流。
 *              不涉及多租户/组织策略。
 */
import type { Pool } from "mysql2/promise";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotpCode,
} from "./totp";
import {
  disableUserMfa,
  enableUserMfa,
  findUserMfa,
  incrementMfaFailCount,
  markMfaTimeStepUsed,
  savePendingMfaSecret,
  updateMfaRecoveryHashes,
} from "@/lib/repos/user-mfa";
import { EC_INTERNAL_ERROR, EC_INVALID_CODE } from "@/shared/constants/api";
import { RouteError } from "@/lib/middleware/route-handler";

export interface MfaStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

/** 查询用户两步验证状态 */
export async function getMfaStatus(pool: Pool, userId: number): Promise<MfaStatus> {
  const row = await findUserMfa(pool, userId);
  return { enabled: Boolean(row?.enabled), recoveryCodesLeft: row?.recoveryHashes.length ?? 0 };
}

/** 是否启用了两步验证（登录流程用） */
export async function isMfaEnabled(pool: Pool, userId: number): Promise<boolean> {
  const row = await findUserMfa(pool, userId);
  return Boolean(row?.enabled);
}

/** 发起绑定：生成密钥并返回 otpauth URI（临时密钥落库，未验证前不启用） */
export async function startMfaSetup(
  pool: Pool,
  userId: number,
  accountLabel: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = generateTotpSecret();
  await savePendingMfaSecret(pool, userId, encryptMfaSecret(secret));
  return { secret, otpauthUri: buildOtpauthUri(secret, accountLabel) };
}

/** 完成绑定：验证动态码 → 启用 → 返回一次性恢复码（仅此一次明文返回） */
export async function enableMfa(pool: Pool, userId: number, code: string): Promise<{ recoveryCodes: string[] }> {
  const row = await findUserMfa(pool, userId);
  if (!row?.pendingSecret) {
    throw new RouteError(400, EC_INVALID_CODE, "绑定已失效，请重新发起绑定");
  }
  const secret = decryptMfaSecret(row.pendingSecret);
  if (!secret) throw new RouteError(500, EC_INTERNAL_ERROR, "密钥解密失败，请重新绑定");

  const timeStep = verifyTotpCode(secret, code);
  if (timeStep === null) {
    await incrementMfaFailCount(pool, userId);
    throw new RouteError(400, EC_INVALID_CODE, "动态码不正确，请确认验证器时间与手机时间一致");
  }

  const recoveryCodes = generateRecoveryCodes(8);
  const hashes = recoveryCodes.map(hashRecoveryCode);
  await enableUserMfa(pool, userId, encryptMfaSecret(secret), hashes);
  await markMfaTimeStepUsed(pool, userId, timeStep);
  return { recoveryCodes };
}

/** 关闭两步验证：需当前动态码或一枚恢复码 */
export async function disableMfa(pool: Pool, userId: number, code: string): Promise<void> {
  const row = await findUserMfa(pool, userId);
  if (!row?.enabled || !row.secret) {
    throw new RouteError(400, EC_INVALID_CODE, "当前账号未开启两步验证");
  }
  const secret = decryptMfaSecret(row.secret);
  if (!secret) throw new RouteError(500, EC_INTERNAL_ERROR, "密钥解密失败，请联系客服");

  const timeStep = verifyTotpCode(secret, code);
  if (timeStep !== null) {
    await disableUserMfa(pool, userId);
    return;
  }
  const consumed = consumeRecoveryCode(row.recoveryHashes, code);
  if (!consumed) {
    await incrementMfaFailCount(pool, userId);
    throw new RouteError(400, EC_INVALID_CODE, "动态码或恢复码不正确");
  }
  await disableUserMfa(pool, userId);
}

/**
 * 登录第二步校验：动态码或恢复码。
 * @returns 通过返回 true；否则抛 400/EC_INVALID_CODE（失败计数 +1）。
 */
export async function verifyMfaForLogin(pool: Pool, userId: number, code: string): Promise<true> {
  const row = await findUserMfa(pool, userId);
  if (!row?.enabled || !row.secret) return true; // 未开启时直接放行（调用方已判断，双保险）

  const secret = decryptMfaSecret(row.secret);
  if (!secret) throw new RouteError(500, EC_INTERNAL_ERROR, "密钥解密失败，请联系客服");

  const timeStep = verifyTotpCode(secret, code);
  if (timeStep !== null) {
    if (row.lastTimeStep !== null && timeStep <= row.lastTimeStep) {
      throw new RouteError(400, EC_INVALID_CODE, "该动态码已被使用，请等待下一个动态码");
    }
    await markMfaTimeStepUsed(pool, userId, timeStep);
    return true;
  }

  const consumed = consumeRecoveryCode(row.recoveryHashes, code);
  if (consumed) {
    await updateMfaRecoveryHashes(pool, userId, consumed.remaining);
    return true;
  }

  await incrementMfaFailCount(pool, userId);
  throw new RouteError(400, EC_INVALID_CODE, "动态码或恢复码不正确");
}

/** 若 code 命中恢复码：返回剩余哈希数组；否则 null */
function consumeRecoveryCode(hashes: string[], code: string): { remaining: string[] } | null {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 8) return null;
  const hash = hashRecoveryCode(code);
  const idx = hashes.indexOf(hash);
  if (idx === -1) return null;
  return { remaining: hashes.filter((_, i) => i !== idx) };
}


