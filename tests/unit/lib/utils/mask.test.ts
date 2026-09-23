import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, maskName, splitListField } from "@/lib/utils/mask";

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

describe("maskName", () => {
  it("中文姓名保留首字，星号最多补 2 个", () => {
    expect(maskName("李大明")).toBe("李**");
    expect(maskName("李明")).toBe("李*");
    expect(maskName("诸葛亮孔明")).toBe("诸**");
  });

  it("单词姓名保留首字符", () => {
    expect(maskName("John")).toBe("J**");
  });

  it("单字符原样返回", () => {
    expect(maskName("李")).toBe("李");
  });

  it("多词姓名保留各词首字母", () => {
    expect(maskName("John Smith")).toBe("J*** S***");
  });

  it("空值返回空串", () => {
    expect(maskName("")).toBe("");
    expect(maskName("   ")).toBe("");
    expect(maskName(null)).toBe("");
    expect(maskName(undefined)).toBe("");
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

  it("括号内的逗号/顿号不切分（认证名含地区描述）", () => {
    // 真实数据：东莞市瑞信医疗用品有限公司 certification 列
    const raw =
      "ISO13485 医疗器械质量体系, CE认证（欧盟）, FDA认证（美国，医疗/食品）, MDR认证（欧盟，医疗）、GMP";
    expect(splitListField(raw)).toEqual([
      "ISO13485 医疗器械质量体系",
      "CE认证（欧盟）",
      "FDA认证（美国，医疗/食品）",
      "MDR认证（欧盟，医疗）",
      "GMP",
    ]);
  });

  it("括号内含顿号也保持完整（CSA 类多地区描述）", () => {
    const raw = "UL认证（美国）, CSA认证（加拿大，电气、建材、医疗）, EAC认证（俄罗斯/欧亚）";
    expect(splitListField(raw)).toEqual([
      "UL认证（美国）",
      "CSA认证（加拿大，电气、建材、医疗）",
      "EAC认证（俄罗斯/欧亚）",
    ]);
  });

  it("半角括号内的分隔符同样不切分", () => {
    expect(splitListField("A(1,2), B")).toEqual(["A(1,2)", "B"]);
  });
});
