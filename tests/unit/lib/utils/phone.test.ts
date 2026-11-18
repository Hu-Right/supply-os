import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  phoneCountryOf,
  isMainlandE164,
  smsTargetOf,
} from "@/lib/utils/phone";

describe("normalizePhone（服务端唯一归一化）", () => {
  it("大陆手机号默认按 CN 归一", () => {
    expect(normalizePhone("13800138000")).toBe("+8613800138000");
    expect(normalizePhone("138 0013 8000")).toBe("+8613800138000");
  });

  it("港澳台号码归一", () => {
    expect(normalizePhone("91234567", "HK")).toBe("+85291234567");
    expect(normalizePhone("66123456", "MO")).toBe("+85366123456");
    expect(normalizePhone("912345678", "TW")).toBe("+886912345678");
  });

  it("已带 + 的输入不再套默认区号", () => {
    expect(normalizePhone("+85291234567")).toBe("+85291234567");
    expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671");
  });

  it("非法号码返回 null", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull(); // 超长
  });
});

describe("展示/通道辅助", () => {
  it("phoneCountryOf 取 ISO 国家码", () => {
    expect(phoneCountryOf("+8613800138000")).toBe("CN");
    expect(phoneCountryOf("+85291234567")).toBe("HK");
  });

  it("isMainlandE164 只认 +86", () => {
    expect(isMainlandE164("+8613800138000")).toBe(true);
    expect(isMainlandE164("+85291234567")).toBe(false);
  });

  it("smsTargetOf 国内去掉 +86，国际保留区号不带 +", () => {
    expect(smsTargetOf("+8613800138000")).toBe("13800138000");
    expect(smsTargetOf("+85291234567")).toBe("85291234567");
  });
});
