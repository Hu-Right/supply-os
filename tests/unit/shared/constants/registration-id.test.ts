/**
 * 注册标识类型与校验的单元测试（供应商 / 采购主体共用口径）
 *
 * 覆盖：类型枚举、归一化、分级校验（USCC 严格 / 香港 / 海外宽松 / other）、按国家推导默认类型。
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REGISTRATION_ID_TYPE,
  REGISTRATION_ID_ERROR_ZH,
  REGISTRATION_ID_TYPES,
  defaultRegistrationIdTypeForCountry,
  isRegistrationIdType,
  normalizeRegistrationId,
  validateRegistrationId,
} from "@/shared/constants/registration-id";

describe("注册标识类型", () => {
  it("枚举包含六种类型，默认类型为 uscc", () => {
    expect(REGISTRATION_ID_TYPES).toEqual(["uscc", "hk_br", "hk_cr", "overseas_reg", "tax_id", "other"]);
    expect(DEFAULT_REGISTRATION_ID_TYPE).toBe("uscc");
    expect(isRegistrationIdType("hk_br")).toBe(true);
    expect(isRegistrationIdType("USCC")).toBe(false);
    expect(isRegistrationIdType(null)).toBe(false);
  });
});

describe("normalizeRegistrationId", () => {
  it("去分隔符并转大写，仅保留 0-9A-Z", () => {
    expect(normalizeRegistrationId(" 91-42co.1234 ")).toBe("9142CO1234");
    expect(normalizeRegistrationId("1234 5678")).toBe("12345678");
    expect(normalizeRegistrationId("ＡＢＣ")).toBe("");
    expect(normalizeRegistrationId(null)).toBe("");
  });
});

describe("validateRegistrationId", () => {
  it("统一社会信用代码：必须 18 位数字/大写字母", () => {
    expect(validateRegistrationId("uscc", "91110000MA12345678")).toEqual({ ok: true });
    expect(validateRegistrationId("uscc", "9111 0000 MA12 3456 78")).toEqual({ ok: true });
    expect(validateRegistrationId("uscc", "91110000MA1234567")).toEqual({ ok: false, code: "uscc" });
    expect(validateRegistrationId("uscc", "")).toEqual({ ok: false, code: "required" });
  });

  it("香港 BR：8 位数字（允许用户输入连字符）", () => {
    expect(validateRegistrationId("hk_br", "12345678")).toEqual({ ok: true });
    expect(validateRegistrationId("hk_br", "1234-5678")).toEqual({ ok: true });
    expect(validateRegistrationId("hk_br", "1234567")).toEqual({ ok: false, code: "hk_br" });
  });

  it("香港 CR：7–12 位数字/大写字母", () => {
    expect(validateRegistrationId("hk_cr", "1234567")).toEqual({ ok: true });
    expect(validateRegistrationId("hk_cr", "AB123456")).toEqual({ ok: true });
    expect(validateRegistrationId("hk_cr", "123456")).toEqual({ ok: false, code: "hk_cr" });
  });

  it("海外注册号 / 税号：归一后 2–64 位即可，不做国别强校验", () => {
    expect(validateRegistrationId("overseas_reg", "HRB 123456")).toEqual({ ok: true });
    expect(validateRegistrationId("tax_id", "NL123456789B01")).toEqual({ ok: true });
    expect(validateRegistrationId("overseas_reg", "1")).toEqual({ ok: false, code: "overseas_len" });
    expect(validateRegistrationId("tax_id", "---")).toEqual({ ok: false, code: "required" });
  });

  it("other：允许自由文本（如「暂无注册号」）", () => {
    expect(validateRegistrationId("other", "暂无注册号，仅有公司注册证书")).toEqual({ ok: true });
    expect(validateRegistrationId("other", "   ")).toEqual({ ok: false, code: "required" });
  });

  it("超过 64 字符一律拒绝", () => {
    expect(validateRegistrationId("overseas_reg", "A".repeat(65))).toEqual({ ok: false, code: "too_long" });
  });

  it("每个失败码都有中文文案", () => {
    for (const value of Object.values(REGISTRATION_ID_ERROR_ZH)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe("defaultRegistrationIdTypeForCountry", () => {
  it("中国大陆 → uscc（接受 ISO2 码与中英文名称）", () => {
    expect(defaultRegistrationIdTypeForCountry("CN")).toBe("uscc");
    expect(defaultRegistrationIdTypeForCountry("中国")).toBe("uscc");
    expect(defaultRegistrationIdTypeForCountry("China")).toBe("uscc");
  });

  it("香港 → hk_br", () => {
    expect(defaultRegistrationIdTypeForCountry("HK")).toBe("hk_br");
    expect(defaultRegistrationIdTypeForCountry("香港")).toBe("hk_br");
    expect(defaultRegistrationIdTypeForCountry("Hong Kong")).toBe("hk_br");
  });

  it("其他国家 → overseas_reg；空值维持默认 uscc", () => {
    expect(defaultRegistrationIdTypeForCountry("US")).toBe("overseas_reg");
    expect(defaultRegistrationIdTypeForCountry("德国")).toBe("overseas_reg");
    expect(defaultRegistrationIdTypeForCountry("")).toBe("uscc");
    expect(defaultRegistrationIdTypeForCountry(null)).toBe("uscc");
  });
});
