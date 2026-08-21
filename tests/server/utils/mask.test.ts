/**
 * server/utils/mask.ts 测试
 */
import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, splitListField } from "../../../server/utils/mask";

describe("maskPhone", () => {
  it("空值返回空字符串", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
    expect(maskPhone(undefined)).toBe("");
  });

  it("短号码（<8位）前2位+****", () => {
    expect(maskPhone("12345")).toBe("12****");
    expect(maskPhone("1234567")).toBe("12****");
  });

  it("正常号码前3位+****+后4位", () => {
    expect(maskPhone("13812345678")).toBe("138****5678");
    expect(maskPhone("010-12345678")).toBe("010****5678");
  });
});

describe("maskEmail", () => {
  it("空值返回空字符串", () => {
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });

  it("无@符号返回 ***", () => {
    expect(maskEmail("noemail")).toBe("***");
  });

  it("正常邮箱脱敏", () => {
    expect(maskEmail("test@example.com")).toBe("te***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("@在开头返回 ***", () => {
    expect(maskEmail("@example.com")).toBe("***");
  });
});

describe("splitListField", () => {
  it("空值返回空数组", () => {
    expect(splitListField("")).toEqual([]);
    expect(splitListField(null)).toEqual([]);
  });

  it("逗号分隔", () => {
    expect(splitListField("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("中文顿号/分号分隔", () => {
    expect(splitListField("甲、乙；丙，丁")).toEqual(["甲", "乙", "丙", "丁"]);
  });

  it("自动 trim 并过滤空项", () => {
    expect(splitListField(" a , , b ")).toEqual(["a", "b"]);
  });
});
