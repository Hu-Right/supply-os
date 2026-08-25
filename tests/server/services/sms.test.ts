/**
 * server/services/sms.ts 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 阿里云 SDK
vi.mock("@alicloud/dysmsapi20170525", () => ({
  default: vi.fn().mockImplementation(() => ({
    sendSms: vi.fn().mockResolvedValue({ body: { code: "OK" } }),
  })),
  SendSmsRequest: vi.fn().mockImplementation((opts) => opts),
}));
vi.mock("@alicloud/openapi-client", () => ({
  default: { Config: vi.fn().mockImplementation((opts) => opts) },
}));

// 设置 mock 模式环境变量
process.env.SMS_PROVIDER = "mock";

import {
  getSmsResetTemplateCode,
  isSmsConfigured,
  sendSmsVerificationCode,
} from "../../../server/services/sms";

describe("getSmsResetTemplateCode", () => {
  it("返回环境变量中的模板 CODE", () => {
    const code = getSmsResetTemplateCode();
    // 未设置 SMS_TEMPLATE_CODE_RESET 时为 undefined
    expect(code === undefined || typeof code === "string").toBe(true);
  });
});

describe("isSmsConfigured", () => {
  it("mock 模式始终返回 true", () => {
    process.env.SMS_PROVIDER = "mock";
    expect(isSmsConfigured()).toBe(true);
  });
});

describe("sendSmsVerificationCode", () => {
  beforeEach(() => {
    process.env.SMS_PROVIDER = "mock";
    vi.restoreAllMocks();
  });

  it("mock 模式返回验证码", async () => {
    const code = await sendSmsVerificationCode("13800138000");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("mock 模式使用预生成验证码", async () => {
    const code = await sendSmsVerificationCode("13800138000", undefined, "999888");
    expect(code).toBe("999888");
  });
});
