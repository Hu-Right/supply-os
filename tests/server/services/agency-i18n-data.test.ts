/**
 * server/services/agency-i18n-data.ts 测试
 * 验证 barrel re-export 层正确转发所有导出
 */
import { describe, it, expect } from "vitest";
import {
  KNOWN_ACRONYMS,
  COUNTRY_ZH,
  INTL_TYPE_EN,
  BR_PREFIX_MAP,
  BR_EXTRA_PREFIX_MAP,
  KENYA_PREFIX_MAP,
  INTL_PREFIX_MAP,
  TYPE_PATTERNS,
  INTL_TYPE_PATTERNS,
  translateByPattern,
} from "../../../server/services/agency-i18n-data";

describe("agency-i18n-data barrel re-export", () => {
  it("KNOWN_ACRONYMS 为 Map", () => {
    expect(KNOWN_ACRONYMS).toBeInstanceOf(Map);
    expect(KNOWN_ACRONYMS.size).toBeGreaterThan(0);
  });

  it("COUNTRY_ZH 为非空对象", () => {
    expect(typeof COUNTRY_ZH).toBe("object");
    expect(Object.keys(COUNTRY_ZH).length).toBeGreaterThan(0);
  });

  it("INTL_TYPE_EN 为非空对象", () => {
    expect(typeof INTL_TYPE_EN).toBe("object");
    expect(Object.keys(INTL_TYPE_EN).length).toBeGreaterThan(0);
  });

  it("四个前缀模式映射均为非空数组", () => {
    expect(Array.isArray(BR_PREFIX_MAP)).toBe(true);
    expect(Array.isArray(BR_EXTRA_PREFIX_MAP)).toBe(true);
    expect(Array.isArray(KENYA_PREFIX_MAP)).toBe(true);
    expect(Array.isArray(INTL_PREFIX_MAP)).toBe(true);
  });

  it("两个类型模式映射均为非空数组", () => {
    expect(Array.isArray(TYPE_PATTERNS)).toBe(true);
    expect(Array.isArray(INTL_TYPE_PATTERNS)).toBe(true);
  });

  it("translateByPattern 为函数且可调用", () => {
    expect(typeof translateByPattern).toBe("function");
    const result = translateByPattern("UNDP");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("UNDP");
  });
});
