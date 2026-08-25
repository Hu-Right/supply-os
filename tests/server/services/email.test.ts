/**
 * server/services/email.ts 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer
const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-msg-id" });
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

/**
 * email.ts 在模块顶层读取 SMTP_* 环境变量为常量。
 * 测试需分两种场景：
 *   1. SMTP 已配置：提前设好 env，动态 import 获取模块
 *   2. SMTP 未配置：不设 env，函数应抛出 SMTP_NOT_CONFIGURED
 */

describe("email service (SMTP configured)", () => {
  let isEmailConfigured: () => boolean;
  let sendPasswordResetEmail: (email: string, code: string) => Promise<void>;
  let sendRegistrationVerifyEmail: (email: string, code: string) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockSendMail.mockClear();

    // 设置 SMTP 环境变量后再动态加载模块
    process.env.SMTP_HOST = "smtp.test.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "test@test.com";
    process.env.SMTP_PASS = "password";

    const mod = await import("../../../server/services/email");
    isEmailConfigured = mod.isEmailConfigured;
    sendPasswordResetEmail = mod.sendPasswordResetEmail;
    sendRegistrationVerifyEmail = mod.sendRegistrationVerifyEmail;
  });

  it("isEmailConfigured 返回 true", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  it("发送密码重置邮件", async () => {
    await sendPasswordResetEmail("user@test.com", "123456");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "找回密码 - 验证码",
      }),
    );
  });

  it("发送注册验证邮件", async () => {
    await sendRegistrationVerifyEmail("new@test.com", "111222");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@test.com",
        subject: "注册验证 - 验证码",
      }),
    );
  });
});

describe("email service (SMTP not configured)", () => {
  let isEmailConfigured: () => boolean;
  let sendPasswordResetEmail: (email: string, code: string) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockSendMail.mockClear();

    // 清除 SMTP 环境变量
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const mod = await import("../../../server/services/email");
    isEmailConfigured = mod.isEmailConfigured;
    sendPasswordResetEmail = mod.sendPasswordResetEmail;
  });

  it("isEmailConfigured 返回 false", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("发送邮件抛出 SMTP_NOT_CONFIGURED", async () => {
    await expect(sendPasswordResetEmail("user@test.com", "123456"))
      .rejects.toThrow("SMTP_NOT_CONFIGURED");
  });
});
