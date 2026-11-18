/**
 * 短信服务纯逻辑单测（不发真实短信）
 *
 * 覆盖 2026-11-18 修正后的双通道口径：
 * - +86 走国内 SendSms（签名 + 模板），非 +86 走国际/港澳台 API（SendMessageToGlobe，
 *   无需签名/模板，Sender ID + 正文）；
 * - 国际短信正文的默认文案、{code} 替换、env 自定义覆盖；
 * - 国际通道是否就绪（SMS_INTL_SENDER_ID）。
 */
import { describe, it, expect } from "vitest";
import {
  INTL_SMS_DEFAULTS,
  INTL_SMS_ENDPOINT_DEFAULT,
  buildIntlSmsMessage,
  intlSmsSenderIdOf,
} from "@/lib/services/sms";

describe("buildIntlSmsMessage", () => {
  it("verify 场景默认英文文案，且 {code} 被替换", () => {
    const msg = buildIntlSmsMessage("verify", "123456");
    expect(msg).toContain("123456");
    expect(msg).toBe(INTL_SMS_DEFAULTS.verify.replace("{code}", "123456"));
    expect(msg).not.toContain("{code}");
  });

  it("reset 场景默认文案与 verify 不同（包含重置语义）", () => {
    const msg = buildIntlSmsMessage("reset", "654321");
    expect(msg).toContain("654321");
    expect(msg.toLowerCase()).toContain("password reset");
  });

  it("env 自定义模板优先，并支持多处 {code} 替换", () => {
    const env = { SMS_INTL_MESSAGE_VERIFY: "Code {code}; again {code}. Yunjing." };
    expect(buildIntlSmsMessage("verify", "999999", env)).toBe(
      "Code 999999; again 999999. Yunjing.",
    );
  });

  it("reset 场景自定义模板独立覆盖，不影响 verify", () => {
    const env = { SMS_INTL_MESSAGE_RESET: "Reset code: {code}" };
    expect(buildIntlSmsMessage("reset", "111111", env)).toBe("Reset code: 111111");
    expect(buildIntlSmsMessage("verify", "111111", env)).toBe(
      INTL_SMS_DEFAULTS.verify.replace("{code}", "111111"),
    );
  });

  it("空字符串覆盖视为未配置，回落默认文案", () => {
    const env = { SMS_INTL_MESSAGE_VERIFY: "   " };
    expect(buildIntlSmsMessage("verify", "222222", env)).toContain("222222");
  });
});

describe("intlSmsSenderIdOf", () => {
  it("缺少/空白 Sender ID → 返回 undefined（回落到阿里云默认 Sender ID）", () => {
    expect(intlSmsSenderIdOf({})).toBeUndefined();
    expect(intlSmsSenderIdOf({ SMS_INTL_SENDER_ID: "   " })).toBeUndefined();
  });

  it("配置了 Sender ID → 原样返回（去空白）", () => {
    expect(intlSmsSenderIdOf({ SMS_INTL_SENDER_ID: " Yunjing " })).toBe("Yunjing");
  });
});

describe("国际/港澳台 API 端点", () => {
  it("默认必须是新加坡端点（国内 dysmsapi.aliyuncs.com 不接受 2018-05-01 版本）", () => {
    expect(INTL_SMS_ENDPOINT_DEFAULT).toBe("dysmsapi.ap-southeast-1.aliyuncs.com");
  });
});
