/**
 * 宽表口径常量（I2 单一事实源）
 *
 * 断言的是「跨层共用」这件事本身：宽表构建、SEO 查询、列表、Meili 文档必须
 * 引用同一组常量，长度不得再各写各的字面量（D13 回归）。
 */
import { describe, it, expect } from "vitest";
import {
  WIDE_LIMITS,
  DESC_SOURCE_EXPR,
  TRANSLATION_MODEL,
  descSourceExpr,
  truncate,
} from "@/lib/utils/notice-field-limits";

describe("WIDE_LIMITS", () => {
  it("描述主列为 2000、未解锁摘要 300、列表 i18n 摘要 500", () => {
    expect(WIDE_LIMITS.description).toBe(2000);
    expect(WIDE_LIMITS.lockedTeaser).toBe(300);
    expect(WIDE_LIMITS.i18nTeaser).toBe(500);
  });

  it("未解锁摘要必须严格小于宽表主列（解锁前不得放宽）", () => {
    expect(WIDE_LIMITS.lockedTeaser).toBeLessThan(WIDE_LIMITS.description);
    expect(WIDE_LIMITS.i18nTeaser).toBeLessThanOrEqual(WIDE_LIMITS.description);
  });

  it("全部值为正整数", () => {
    for (const v of Object.values(WIDE_LIMITS)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("DESC_SOURCE_EXPR", () => {
  it("默认别名下机会表描述优先（与 buildWideRow 同口径）", () => {
    expect(DESC_SOURCE_EXPR).toBe("COALESCE(opp.description, n.description)");
  });

  it("支持自定义表别名", () => {
    expect(descSourceExpr("x", "y")).toBe("COALESCE(x.description, y.description)");
  });
});

describe("TRANSLATION_MODEL", () => {
  it("同语言直通值与翻译管道实际写入值一致（D6 回归）", () => {
    expect(TRANSLATION_MODEL.SAME_LANG).toBe("same-lang-passthrough");
  });

  it("英文中枢兜底标记独立于 provider 名", () => {
    expect(TRANSLATION_MODEL.EN_PIVOT).toBe("en-pivot");
    expect(TRANSLATION_MODEL.EN_PIVOT).not.toBe(TRANSLATION_MODEL.SAME_LANG);
  });
});

describe("truncate", () => {
  it("按 WIDE_LIMITS 截断且 null 归零长度", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcde");
    expect(truncate(null, WIDE_LIMITS.title)).toBe("");
    expect(truncate(undefined, WIDE_LIMITS.title)).toBe("");
  });

  it("按码点而非 UTF-16 码元截断（与 SQL LEFT() 同语义，不断裂代理对）", () => {
    // "😀" 占 2 个码元；按码元切会产出孤立代理项，与 SQL LEFT(str, n) 结果不一致
    expect(truncate("😀😀😀", 2)).toBe("😀😀");
    expect(truncate("😀abc", 2)).toBe("😀a");
  });
});
