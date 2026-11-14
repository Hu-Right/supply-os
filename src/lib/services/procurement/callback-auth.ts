/**
 * 评审回调签名校验
 * @module lib/services/procurement/callback-auth
 *
 * @description 评审后台与门户之间只有一条入站通道（审核结论回调），因此这条通道的鉴权必须自洽：
 *              - 共享密钥 HMAC-SHA256，签名内容为 `${timestamp}.${rawBody}`；
 *              - 时间戳容差 ±300s（防重放）；
 *              - 恒定时间比较（防时序侧信道）；
 *              - 幂等键由调用方另行校验（`X-Review-Request-Id` → `rfq_review_task.callback_id`）。
 *
 *              这些端点不是管理后台（无用户会话、无人工运营能力），但仍是一条网络入口，
 *              边界与密钥轮换记录在 docs/adr/0015-rfq-review-contract.md。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 允许的时钟偏移（秒） */
export const CALLBACK_TOLERANCE_SEC = 300;

/** 生成签名（供评审后台实现参考，也用于自测） */
export function signCallbackPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export type CallbackAuthFailure = "missing_signature" | "stale_timestamp" | "signature_mismatch";

export type CallbackAuthResult = { ok: true } | { ok: false; reason: CallbackAuthFailure };

export interface VerifyCallbackInput {
  secret: string;
  timestamp: number;
  signature: string;
  rawBody: string;
  nowSec: number;
}

/** 校验签名与时间戳 */
export function verifyCallbackRequest(input: VerifyCallbackInput): CallbackAuthResult {
  if (!input.signature) return { ok: false, reason: "missing_signature" };
  if (!Number.isFinite(input.timestamp) || Math.abs(input.nowSec - input.timestamp) > CALLBACK_TOLERANCE_SEC) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = signCallbackPayload(input.secret, input.timestamp, input.rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signature.toLowerCase(), "utf8");
  // 长度不同直接判失败；等长时用恒定时间比较，避免按字节提前返回
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}
