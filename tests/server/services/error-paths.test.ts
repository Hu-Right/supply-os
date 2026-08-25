/**
 * P2 — 服务层错误路径 + 异常分支增强测试
 * 覆盖 sms.ts 阿里云模式错误路径、jwt.ts 篡改/配置缺失、
 *       email.ts 发送失败传播、auth.ts 未知 hashType 降级、
 *       paymentHistory.ts deadline_ts 边界 + 翻译跳过条件、
 *       reportCacheCleanup.ts 目录/文件过滤
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// JWT 模块在导入时读取 JWT_SECRET，须在其他模块加载前设置
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-unit-tests-only";

// paymentHistory 依赖的翻译模块 mock
vi.mock("../../../server/services/translation/notice", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: true, en: true },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn().mockResolvedValue({ translations: ["翻译", "描述"], provider: "mock" }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// sms.ts — 阿里云模式错误路径
// ═══════════════════════════════════════════════════════════════════════════════

describe("sms.ts — aliyun 模式错误路径", () => {
  const mockSendSms = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockSendSms.mockReset();
  });

  afterEach(() => {
    delete process.env.SMS_PROVIDER;
    delete process.env.SMS_ACCESS_KEY_ID;
    delete process.env.SMS_ACCESS_KEY_SECRET;
  });

  it("aliyun 模式 + 无 access key → SMS_NOT_CONFIGURED", async () => {
    process.env.SMS_PROVIDER = "aliyun";
    delete process.env.SMS_ACCESS_KEY_ID;
    delete process.env.SMS_ACCESS_KEY_SECRET;

    vi.doMock("@alicloud/dysmsapi20170525", () => ({
      default: vi.fn(),
      SendSmsRequest: class { constructor(opts: any) { Object.assign(this, opts); } },
    }));
    vi.doMock("@alicloud/openapi-client", () => ({
      default: { Config: vi.fn((opts) => opts) },
    }));

    const { sendSmsVerificationCode } = await import("../../../server/services/sms");
    await expect(sendSmsVerificationCode("13800138000")).rejects.toThrow("SMS_NOT_CONFIGURED");
  });

  it("aliyun 模式 + 发送失败（body.code !== OK）→ SMS_SEND_FAILED", async () => {
    process.env.SMS_PROVIDER = "aliyun";
    process.env.SMS_ACCESS_KEY_ID = "test-key";
    process.env.SMS_ACCESS_KEY_SECRET = "test-secret";

    mockSendSms.mockResolvedValue({ body: { code: "isv.BUSINESS_LIMIT_CONTROL", message: "trigger frequency limit" } });

    vi.doMock("@alicloud/dysmsapi20170525", () => ({
      default: class { sendSms = mockSendSms; },
      SendSmsRequest: class { constructor(opts: any) { Object.assign(this, opts); } },
    }));
    vi.doMock("@alicloud/openapi-client", () => {
      class FakeConfig { constructor(opts: any) { Object.assign(this, opts); } }
      return { Config: FakeConfig, default: { Config: FakeConfig } };
    });

    const { sendSmsVerificationCode } = await import("../../../server/services/sms");
    await expect(sendSmsVerificationCode("13800138000")).rejects.toThrow("SMS_SEND_FAILED");
  });

  it("aliyun 模式 + SDK 抛异常 → SMS_SEND_ERROR 包装", async () => {
    process.env.SMS_PROVIDER = "aliyun";
    process.env.SMS_ACCESS_KEY_ID = "test-key";
    process.env.SMS_ACCESS_KEY_SECRET = "test-secret";

    mockSendSms.mockRejectedValue(new Error("network timeout"));

    vi.doMock("@alicloud/dysmsapi20170525", () => ({
      default: class { sendSms = mockSendSms; },
      SendSmsRequest: class { constructor(opts: any) { Object.assign(this, opts); } },
    }));
    vi.doMock("@alicloud/openapi-client", () => {
      class FakeConfig { constructor(opts: any) { Object.assign(this, opts); } }
      return { Config: FakeConfig, default: { Config: FakeConfig } };
    });

    const { sendSmsVerificationCode } = await import("../../../server/services/sms");
    await expect(sendSmsVerificationCode("13800138000")).rejects.toThrow("SMS_SEND_ERROR");
  });

  it("aliyun 模式 + body.code=OK 但 message 缺失 → 成功返回验证码", async () => {
    process.env.SMS_PROVIDER = "aliyun";
    process.env.SMS_ACCESS_KEY_ID = "test-key";
    process.env.SMS_ACCESS_KEY_SECRET = "test-secret";

    mockSendSms.mockResolvedValue({ body: { code: "OK" } });

    vi.doMock("@alicloud/dysmsapi20170525", () => ({
      default: class { sendSms = mockSendSms; },
      SendSmsRequest: class { constructor(opts: any) { Object.assign(this, opts); } },
    }));
    vi.doMock("@alicloud/openapi-client", () => {
      class FakeConfig { constructor(opts: any) { Object.assign(this, opts); } }
      return { Config: FakeConfig, default: { Config: FakeConfig } };
    });

    const { sendSmsVerificationCode } = await import("../../../server/services/sms");
    const code = await sendSmsVerificationCode("13800138000", undefined, "555666");
    expect(code).toBe("555666");
  });

  it("aliyun 模式 + 已抛出 SMS_ 前缀错误不被二次包装", async () => {
    process.env.SMS_PROVIDER = "aliyun";
    process.env.SMS_ACCESS_KEY_ID = "test-key";
    process.env.SMS_ACCESS_KEY_SECRET = "test-secret";

    // sendSms 抛出的错误消息以 SMS_ 开头 → 直接 rethrow
    mockSendSms.mockRejectedValue(new Error("SMS_SEND_FAILED: isv.BUSINESS_LIMIT_CONTROL"));

    vi.doMock("@alicloud/dysmsapi20170525", () => ({
      default: class { sendSms = mockSendSms; },
      SendSmsRequest: class { constructor(opts: any) { Object.assign(this, opts); } },
    }));
    vi.doMock("@alicloud/openapi-client", () => {
      class FakeConfig { constructor(opts: any) { Object.assign(this, opts); } }
      return { Config: FakeConfig, default: { Config: FakeConfig } };
    });

    const { sendSmsVerificationCode } = await import("../../../server/services/sms");
    await expect(sendSmsVerificationCode("13800138000")).rejects.toThrow("SMS_SEND_FAILED");
    // 确认不是 SMS_SEND_ERROR 包装
    try {
      await sendSmsVerificationCode("13800138000");
    } catch (err: any) {
      expect(err.message).not.toContain("SMS_SEND_ERROR");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// jwt.ts — 篡改 / 配置缺失 / 边界
// ═══════════════════════════════════════════════════════════════════════════════

describe("jwt.ts — 错误路径增强", () => {
  let jwt: typeof import("../../../server/services/jwt");

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-secret-key-for-unit-tests-only";
    jwt = await import("../../../server/services/jwt");
  });

  it("篡改 access token payload → 验证抛出异常", () => {
    const token = jwt.signAccessToken({ user_key: "u1", email: "a@b.com" });
    // 篡改: 翻转 payload 段中间字符
    const parts = token.split(".");
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    const tampered = payload.replace(/u1/, "XX");
    parts[1] = Buffer.from(tampered, "utf-8").toString("base64url");
    const tamperedToken = parts.join(".");

    expect(() => jwt.verifyAccessToken(tamperedToken)).toThrow();
  });

  it("篡改 refresh token → 验证抛出异常", () => {
    const { token } = jwt.signRefreshToken({ user_key: "u1" });
    const parts = token.split(".");
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    const tampered = payload.replace(/u1/, "ZZ");
    parts[1] = Buffer.from(tampered, "utf-8").toString("base64url");

    expect(() => jwt.verifyRefreshToken(parts.join("."))).toThrow();
  });

  it("空字符串 token → verifyAccessToken 抛出异常", () => {
    expect(() => jwt.verifyAccessToken("")).toThrow();
  });

  it("空字符串 token → verifyRefreshToken 抛出异常", () => {
    expect(() => jwt.verifyRefreshToken("")).toThrow();
  });

  it("extractBearerToken 多空格 → \s+ 贪婪匹配后 .+ 捕获剩余", () => {
    // "Bearer  token-with-space" → \s+ 贪婪匹配两个空格后 .+ 回溯捕获 "token-with-space"
    const result = jwt.extractBearerToken("Bearer  token-with-space");
    expect(result).toBe("token-with-space");
  });

  it("extractBearerToken 只有 Bearer 无内容 → null", () => {
    expect(jwt.extractBearerToken("Bearer ")).toBeNull();
    expect(jwt.extractBearerToken("Bearer")).toBeNull();
  });

  it("extractBearerToken 大小写混合 Bearer → 正常提取", () => {
    expect(jwt.extractBearerToken("BEARER abc")).toBe("abc");
    expect(jwt.extractBearerToken("bearer xyz")).toBe("xyz");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// auth.ts — verifyPassword 未知 hashType 降级
// ═══════════════════════════════════════════════════════════════════════════════

describe("auth.ts — verifyPassword 未知 hashType", () => {
  it("未知 hashType 走 sha256 兼容路径", async () => {
    const { verifyPassword, hashPasswordLegacy } = await import("../../../server/services/auth");
    const hash = hashPasswordLegacy("mypass");
    // hashType 为 "md5"（非 "bcrypt"）→ 走 sha256 兼容
    const result = await verifyPassword("mypass", hash, "md5");
    expect(result).toBe(true);

    const wrong = await verifyPassword("wrong", hash, "md5");
    expect(wrong).toBe(false);
  });

  it("空密码仍可验证（不会抛异常）", async () => {
    const { verifyPassword, hashPasswordLegacy } = await import("../../../server/services/auth");
    const hash = hashPasswordLegacy("");
    const result = await verifyPassword("", hash, "sha256");
    expect(result).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// email.ts — 发送失败传播 + 注册验证邮件 SMTP_NOT_CONFIGURED
// ═══════════════════════════════════════════════════════════════════════════════

describe("email.ts — 错误路径增强", () => {
  const mockSendMail = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockSendMail.mockReset();
  });

  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it("sendMail 失败 → 异常传播到调用方", async () => {
    process.env.SMTP_HOST = "smtp.test.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "test@test.com";
    process.env.SMTP_PASS = "password";

    mockSendMail.mockRejectedValue(new Error("connection refused"));
    vi.doMock("nodemailer", () => ({
      default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
    }));

    const { sendPasswordResetEmail } = await import("../../../server/services/email");
    await expect(sendPasswordResetEmail("user@test.com", "123456")).rejects.toThrow("connection refused");
  });

  it("sendRegistrationVerifyEmail + SMTP 未配置 → SMTP_NOT_CONFIGURED", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const { sendRegistrationVerifyEmail } = await import("../../../server/services/email");
    await expect(sendRegistrationVerifyEmail("new@test.com", "111222")).rejects.toThrow("SMTP_NOT_CONFIGURED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// paymentHistory.ts — deadline_ts 毫秒边界 + 翻译跳过条件
// ═══════════════════════════════════════════════════════════════════════════════

describe("paymentHistory.ts — 错误路径 + 边界", () => {
  it("deadline_ts 毫秒级（> 100000000000）→ 直接与 Date.now() 比较", async () => {
    const { listUnlockHistory } = await import("../../../server/services/paymentHistory");
    const futureMs = Date.now() + 86400000; // 明天（毫秒级）
    const repo = {
      countUnlocks: vi.fn().mockResolvedValue(1),
      listUnlocks: vi.fn().mockResolvedValue([{
        user_key: "u", notice_id: 1, unlock_type: "free", price: 0,
        unlocked_at: "2026-01-01", external_notice_id: "E1", source_channel: "UN",
        reference: "R1", title: "T", notice_type: "bid", agency: "A",
        country: "C", deadline: "2099-12-31", deadline_ts: futureMs,
        url: "", industry: "",
      }]),
      upsertNoticeTranslation: vi.fn(),
    } as any;

    const result = await listUnlockHistory(repo, { userKey: "u", lang: "en", page: 1, limit: 10 });
    // 未来时间 → deadline_expired = false
    expect(result.list[0].notice!.deadline_expired).toBe(false);
  });

  it("deadline_ts 为 null → deadline_expired 为 null", async () => {
    const { listUnlockHistory } = await import("../../../server/services/paymentHistory");
    const repo = {
      countUnlocks: vi.fn().mockResolvedValue(1),
      listUnlocks: vi.fn().mockResolvedValue([{
        user_key: "u", notice_id: 2, unlock_type: "free", price: 0,
        unlocked_at: "2026-01-01", external_notice_id: "E2", source_channel: "UN",
        reference: "R2", title: "T", notice_type: "bid", agency: "A",
        country: "C", deadline: "2099-12-31", deadline_ts: null,
        url: "", industry: "",
      }]),
      upsertNoticeTranslation: vi.fn(),
    } as any;

    const result = await listUnlockHistory(repo, { userKey: "u", lang: "en", page: 1, limit: 10 });
    expect(result.list[0].notice!.deadline_expired).toBeNull();
  });

  it("notice_id 为 null → notice 字段为 null", async () => {
    const { listOrderHistory } = await import("../../../server/services/paymentHistory");
    const repo = {
      countOrders: vi.fn().mockResolvedValue(1),
      listOrders: vi.fn().mockResolvedValue([{
        order_no: "O1", user_key: "u", provider: "mock", plan_code: "free",
        notice_id: null, amount: 0, currency: "CNY", status: "paid",
        created_at: "2026-01-01", updated_at: "2026-01-01",
      }]),
    } as any;

    const result = await listOrderHistory(repo, { userKey: "u", status: "paid", page: 1, limit: 10 });
    expect(result.list[0].notice).toBeNull();
  });

  it("amount 为 null/undefined → 默认为 0", async () => {
    const { listOrderHistory } = await import("../../../server/services/paymentHistory");
    const repo = {
      countOrders: vi.fn().mockResolvedValue(1),
      listOrders: vi.fn().mockResolvedValue([{
        order_no: "O2", user_key: "u", provider: "mock", plan_code: "pro",
        notice_id: null, amount: null, currency: "USD", status: "paid",
        created_at: "2026-01-01", updated_at: "2026-01-01",
      }]),
    } as any;

    const result = await listOrderHistory(repo, { userKey: "u", status: "", page: 1, limit: 10 });
    expect(result.list[0].amount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reportCacheCleanup.ts — 目录/文件过滤
// ═══════════════════════════════════════════════════════════════════════════════

describe("reportCacheCleanup.ts — 错误路径", () => {
  it("clearReportCache — 目录不存在 → 返回 0", async () => {
    const { clearReportCache } = await import("../../../server/services/reportCacheCleanup");
    const count = await clearReportCache("/nonexistent/path/that/does/not/exist");
    expect(count).toBe(0);
  });

  it("clearReportCache — 只删除 .docx 文件", async () => {
    const { clearReportCache } = await import("../../../server/services/reportCacheCleanup");
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const tmpDir = path.join(os.tmpdir(), `cleanup-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      // 创建测试文件
      fs.writeFileSync(path.join(tmpDir, "report.docx"), "x");
      fs.writeFileSync(path.join(tmpDir, "readme.txt"), "z");
      fs.writeFileSync(path.join(tmpDir, "data.json"), "{}");

      const count = await clearReportCache(tmpDir);
      // .docx 应被删除
      expect(count).toBe(1);

      // 非 .docx 文件应保留
      const remaining = fs.readdirSync(tmpDir);
      expect(remaining).toContain("readme.txt");
      expect(remaining).toContain("data.json");
      expect(remaining).not.toContain("report.docx");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("startReportCacheCleanup — disabled 返回 noop stop", async () => {
    const { startReportCacheCleanup } = await import("../../../server/services/reportCacheCleanup");
    const stop = startReportCacheCleanup({ enabled: false });
    expect(typeof stop).toBe("function");
    // 调用 stop 不应抛异常
    expect(() => stop()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// suppliers.ts — mapSupplierRow 边界
// ═══════════════════════════════════════════════════════════════════════════════

describe("suppliers.ts — mapSupplierRow 边界", () => {
  let mapSupplierRow: (row: any, tr: any) => any;

  beforeEach(async () => {
    const mod = await import("../../../server/services/suppliers");
    mapSupplierRow = mod.mapSupplierRow;
  });

  it("products 为空时 industryZh 回退到 '其他'", () => {
    const row = { id: 10, company: "Empty", industry: "", products: "" };
    const result = mapSupplierRow(row, null);
    expect(result.industryZh).toBe("其他");
  });

  it("products 非空但 industry 为空 → industryZh 取 products 首项", () => {
    const row = { id: 11, company: "Prod", industry: "", products: "Textiles, Garments" };
    const result = mapSupplierRow(row, null);
    expect(result.industryZh).toBe("Textiles");
  });

  it("country_code=CN 但 country 有值 → countryEn 取 China", () => {
    const row = { id: 12, company: "CN Corp", country: "中国", country_code: "CN" };
    const result = mapSupplierRow(row, null);
    expect(result.countryEn).toBe("China");
  });

  it("country_code 非 CN + country 为空 → countryEn 默认 'China'", () => {
    const row = { id: 13, company: "Unknown", country: "", country_code: "US" };
    const result = mapSupplierRow(row, null);
    expect(result.countryEn).toBe("China");
  });

  it("city 为空但 province 有值 → cityZh 取 province", () => {
    const row = { id: 14, company: "Prov", city: "", province: "广东省" };
    const result = mapSupplierRow(row, null);
    expect(result.cityZh).toBe("广东省");
  });

  it("翻译对象 industry_tr 为空 → 回退到中文 industryZh", () => {
    const row = { id: 15, company: "Fallback", industry: "制造业" };
    const tr = { industry_tr: "", main_products_tr: "" };
    const result = mapSupplierRow(row, tr);
    expect(result.industryEn).toBe("制造业");
  });
});
