import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, splitListField } from "./mask";

describe("maskPhone", () => {
  it("正常手机号（11 位）→ 前 3 + **** + 后 4", () => {
    expect(maskPhone("13812345678")).toBe("138****5678");
  });

  it("短号码（<8 位）→ 前 2 + ****", () => {
    expect(maskPhone("12345")).toBe("12****");
  });

  it("空值 → 空字符串", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
    expect(maskPhone(undefined)).toBe("");
  });

  it("非字符串输入自动转字符串", () => {
    expect(maskPhone(13812345678)).toBe("138****5678");
  });

  it("8 位号码 → 前 3 + **** + 后 4", () => {
    expect(maskPhone("12345678")).toBe("123****5678");
  });
});

describe("maskEmail", () => {
  it("正常邮箱 → 前 2 + *** + @域名", () => {
    expect(maskEmail("test@example.com")).toBe("te***@example.com");
  });

  it("单字符用户名 → 1 字符 + *** + @域名", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("空值 → 空字符串", () => {
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });

  it("无 @ 符号 → ***", () => {
    expect(maskEmail("invalidemail")).toBe("***");
  });

  it("@ 在首位 → ***", () => {
    expect(maskEmail("@example.com")).toBe("***");
  });
});

describe("splitListField", () => {
  it("逗号分隔 → 去空数组", () => {
    expect(splitListField("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("中文顿号/分号混合分隔", () => {
    expect(splitListField("甲、乙；丙，丁")).toEqual(["甲", "乙", "丙", "丁"]);
  });

  it("含空白的条目自动过滤", () => {
    expect(splitListField("a, ,b,, c")).toEqual(["a", "b", "c"]);
  });

  it("空值 → 空数组", () => {
    expect(splitListField("")).toEqual([]);
    expect(splitListField(null)).toEqual([]);
  });
});
