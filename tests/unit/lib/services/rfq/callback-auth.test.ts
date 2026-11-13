/**
 * 审核回调签名校验单测
 * @module tests/unit/lib/services/rfq/callback-auth
 */
import { describe, it, expect } from "vitest";
import {
  CALLBACK_TOLERANCE_SEC,
  signCallbackPayload,
  verifyCallbackRequest,
} from "@/lib/services/rfq/callback-auth";

const SECRET = "test-secret-please-rotate";
const NOW = 1_777_593_600;
const BODY = JSON.stringify({ demandId: 7, version: 2, decision: "approved" });

describe("verifyCallbackRequest", () => {
  it("正确签名通过", () => {
    const ts = NOW;
    const signature = signCallbackPayload(SECRET, ts, BODY);
    expect(verifyCallbackRequest({ secret: SECRET, timestamp: ts, signature, rawBody: BODY, nowSec: NOW }))
      .toEqual({ ok: true });
  });

  it("大写十六进制签名同样通过（后台实现常见差异）", () => {
    const ts = NOW;
    const signature = signCallbackPayload(SECRET, ts, BODY).toUpperCase();
    expect(verifyCallbackRequest({ secret: SECRET, timestamp: ts, signature, rawBody: BODY, nowSec: NOW }).ok).toBe(true);
  });

  it("篡改 body → 签名不匹配", () => {
    const ts = NOW;
    const signature = signCallbackPayload(SECRET, ts, BODY);
    const tampered = BODY.replace('"approved"', '"rejected"');
    expect(verifyCallbackRequest({ secret: SECRET, timestamp: ts, signature, rawBody: tampered, nowSec: NOW }))
      .toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("超出容差的时间戳 → stale_timestamp（防重放）", () => {
    const ts = NOW - CALLBACK_TOLERANCE_SEC - 1;
    const signature = signCallbackPayload(SECRET, ts, BODY);
    expect(verifyCallbackRequest({ secret: SECRET, timestamp: ts, signature, rawBody: BODY, nowSec: NOW }))
      .toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("容差边界内仍通过", () => {
    const ts = NOW - CALLBACK_TOLERANCE_SEC;
    const signature = signCallbackPayload(SECRET, ts, BODY);
    expect(verifyCallbackRequest({ secret: SECRET, timestamp: ts, signature, rawBody: BODY, nowSec: NOW }).ok).toBe(true);
  });

  it("缺少签名 → missing_signature", () => {
    expect(verifyCallbackRequest({ secret: SECRET, timestamp: NOW, signature: "", rawBody: BODY, nowSec: NOW }))
      .toEqual({ ok: false, reason: "missing_signature" });
  });

  it("换密钥即失败", () => {
    const signature = signCallbackPayload(SECRET, NOW, BODY);
    expect(verifyCallbackRequest({ secret: "other", timestamp: NOW, signature, rawBody: BODY, nowSec: NOW }).ok).toBe(false);
  });
});
