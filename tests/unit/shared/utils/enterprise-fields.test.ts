/**
 * 企业信息字段归一（established_at / registered_capital）纯函数覆盖。
 * 根因：GET 返回 Date 序列化的 ISO 串（24 字符）回填后再保存撞 zod max(20)；
 * 「500万元」这类文本落 DECIMAL(16,2) 撞 SQL（500）。本测试钉住两条归一规则。
 */
import { describe, it, expect } from "vitest";
import {
  normalizeEstablishedAt, formatEstablishedAtForInput,
  normalizeRegisteredCapital, isValidRegisteredCapital,
} from "@/shared/utils/enterprise-fields";

describe("normalizeEstablishedAt", () => {
  it("ISO 串按北京时间还原日历日（UTC 16:00 是次日）", () => {
    expect(normalizeEstablishedAt("2008-03-14T16:00:00.000Z")).toBe("2008-03-15");
    expect(normalizeEstablishedAt("2024-01-01T00:00:00.000Z")).toBe("2024-01-01");
  });

  it("常见分隔符/中文日期归一为 YYYY-MM-DD", () => {
    expect(normalizeEstablishedAt("2015-06-01")).toBe("2015-06-01");
    expect(normalizeEstablishedAt("2015/6/1")).toBe("2015-06-01");
    expect(normalizeEstablishedAt("2015.06.01")).toBe("2015-06-01");
    expect(normalizeEstablishedAt("2015年6月1日")).toBe("2015-06-01");
  });

  it("空值 → 空串；非法日期/非法文本原样返回（交给 zod 报错）", () => {
    expect(normalizeEstablishedAt("")).toBe("");
    expect(normalizeEstablishedAt(null)).toBe("");
    expect(normalizeEstablishedAt("2015-02-31")).toBe("2015-02-31");
    expect(normalizeEstablishedAt("去年")).toBe("去年");
  });
});

describe("formatEstablishedAtForInput", () => {
  it("ISO → 北京时间日期串；非法 → 空串", () => {
    expect(formatEstablishedAtForInput("2008-03-14T16:00:00.000Z")).toBe("2008-03-15");
    expect(formatEstablishedAtForInput("2008-03-15")).toBe("2008-03-15");
    expect(formatEstablishedAtForInput(null)).toBe("");
    expect(formatEstablishedAtForInput("不是日期")).toBe("");
  });
});

describe("normalizeRegisteredCapital", () => {
  it("带「万/亿」单位按元换算（supplier.registered_capital 是元口径）", () => {
    expect(normalizeRegisteredCapital("500万元")).toBe("5000000");
    expect(normalizeRegisteredCapital("500万")).toBe("5000000");
    expect(normalizeRegisteredCapital("1亿")).toBe("100000000");
    expect(normalizeRegisteredCapital("1.5亿元")).toBe("150000000");
    expect(normalizeRegisteredCapital("5,000万")).toBe("50000000");
  });

  it("不带单位即元：剥掉币种/千分位，数值本身不动", () => {
    expect(normalizeRegisteredCapital("￥5,000,000元")).toBe("5000000");
    expect(normalizeRegisteredCapital("1,200.50")).toBe("1200.50");
    expect(normalizeRegisteredCapital("5000")).toBe("5000");
    expect(normalizeRegisteredCapital("")).toBe("");
  });

  it("换算结果保持 DECIMAL(16,2) 可存（两位小数封顶，不产浮点尾巴）", () => {
    expect(normalizeRegisteredCapital("0.333万元")).toBe("3330");
    expect(normalizeRegisteredCapital("1.005万元")).toBe("10050");
  });

  it("溢出 DECIMAL(16,2) 上限视为非法（交 zod/本地校验报错，不落库）", () => {
    const s = normalizeRegisteredCapital("9999万亿");
    expect(isValidRegisteredCapital(s)).toBe(false);
  });
});

describe("normalizeRegisteredCapital 非法输入", () => {
  it("非数字原样返回（交给 zod 报错）", () => {
    expect(normalizeRegisteredCapital("很多钱")).toBe("很多钱");
    expect(isValidRegisteredCapital(normalizeRegisteredCapital("很多钱"))).toBe(false);
    expect(isValidRegisteredCapital(normalizeRegisteredCapital("500万元"))).toBe(true);
  });
});
