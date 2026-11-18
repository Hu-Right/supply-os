import { describe, it, expect } from "vitest";
import {
  E164_RE,
  isE164,
  looksLikePhone,
  phoneLookupCandidates,
} from "@/shared/utils/phone";

describe("isE164", () => {
  it("接受带国家码的号码", () => {
    expect(isE164("+8613800138000")).toBe(true);
    expect(isE164("+85291234567")).toBe(true);
    expect(E164_RE.test("+886912345678")).toBe(true);
  });

  it("拒绝本地格式与非法串", () => {
    expect(isE164("13800138000")).toBe(false);
    expect(isE164("+0123456")).toBe(false);
    expect(isE164("+86 13800138000")).toBe(false);
    expect(isE164("")).toBe(false);
  });
});

describe("looksLikePhone（区分手机号与邮箱）", () => {
  it("数字/带 + 的输入视为手机号", () => {
    expect(looksLikePhone("13800138000")).toBe(true);
    expect(looksLikePhone("+85291234567")).toBe(true);
    expect(looksLikePhone("9123 4567")).toBe(true);
  });

  it("邮箱与字母串不算手机号", () => {
    expect(looksLikePhone("user@example.com")).toBe(false);
    expect(looksLikePhone("abc12345")).toBe(false);
    expect(looksLikePhone("")).toBe(false);
  });
});

describe("phoneLookupCandidates（登录/找回按候选查库）", () => {
  it("大陆 11 位 → +86", () => {
    expect(phoneLookupCandidates("13800138000")).toEqual(["+8613800138000"]);
  });

  it("8 位 → 香港与澳门两种候选", () => {
    expect(phoneLookupCandidates("91234567").sort()).toEqual(["+85291234567", "+85391234567"]);
  });

  it("台湾 9 位与 0 开头的 10 位", () => {
    expect(phoneLookupCandidates("912345678")).toEqual(["+886912345678"]);
    expect(phoneLookupCandidates("0912345678")).toEqual(["+886912345678"]);
  });

  it("已带国家码原样归一", () => {
    expect(phoneLookupCandidates("+852 9123 4567")).toEqual(["+85291234567"]);
  });

  it("邮箱/过短/过长返回空数组", () => {
    expect(phoneLookupCandidates("user@example.com")).toEqual([]);
    expect(phoneLookupCandidates("a91234567@example.com")).toEqual([]); // 邮箱里带数字也不能当号码
    expect(phoneLookupCandidates("12345")).toEqual([]);
    expect(phoneLookupCandidates("+1234567890123456")).toEqual([]);
  });
});
