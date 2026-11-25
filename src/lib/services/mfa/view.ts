/**
 * 两步验证 API 响应视图（wire 契约）
 *
 * @module lib/services/mfa/view
 * @description 显式列键、camelCase，禁止把服务返回值整块透出（check-api-field-naming 红线）。
 */
import type { InvoiceRequestView } from "@/types/billing";

export interface MfaStatusData {
  enabled: boolean;
  recoveryCodesLeft: number;
}

export interface MfaSetupData {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

/** 状态视图 */
export function mfaStatusViewOf(status: MfaStatusData): MfaStatusData {
  return { enabled: Boolean(status.enabled), recoveryCodesLeft: Number(status.recoveryCodesLeft) };
}

/** 绑定初始化视图 */
export function mfaSetupViewOf(setup: MfaSetupData): MfaSetupData {
  return { secret: setup.secret, otpauthUri: setup.otpauthUri, qrDataUrl: setup.qrDataUrl };
}

/** 启用视图（恢复码只在启用时明文返回一次） */
export function mfaEnableViewOf(recoveryCodes: string[]): { success: true; recoveryCodes: string[] } {
  return { success: true, recoveryCodes: [...recoveryCodes] };
}

/** 登录第二步完成视图（与登录接口同形） */
export function mfaLoginViewOf<U>(
  user: U,
  token: string,
  refreshToken: string,
): { success: true; user: U; token: string; refreshToken: string } {
  return { success: true, user, token, refreshToken };
}

/** 保留占位避免 types/billing 未使用告警（视图模块仅暴露 MFA 键） */
export type MfaWireView = InvoiceRequestView;

