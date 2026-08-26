/**
 * server/data/agency-i18n/known-acronyms.ts 测试
 * 验证精确缩写匹配映射表
 */
import { describe, it, expect } from "vitest";
import { KNOWN_ACRONYMS } from "../../../../server/data/agency-i18n/known-acronyms";

describe("KNOWN_ACRONYMS", () => {
  it("导出为 Map 实例", () => {
    expect(KNOWN_ACRONYMS).toBeInstanceOf(Map);
  });

  it("条目数 > 50", () => {
    expect(KNOWN_ACRONYMS.size).toBeGreaterThan(50);
  });

  it("每个条目都有 canonical 和 i18n.zh", () => {
    for (const [key, value] of KNOWN_ACRONYMS) {
      expect(typeof key).toBe("string");
      expect(key.trim().length).toBeGreaterThan(0);
      expect(typeof value.canonical).toBe("string");
      expect(value.canonical.trim().length).toBeGreaterThan(0);
      expect(typeof value.i18n.zh).toBe("string");
      expect(value.i18n.zh!.trim().length).toBeGreaterThan(0);
    }
  });

  it("UNDP 映射正确", () => {
    const result = KNOWN_ACRONYMS.get("UNDP");
    expect(result).toBeDefined();
    expect(result!.canonical).toBe("UNDP");
    expect(result!.i18n.zh).toBe("联合国开发计划署");
    expect(result!.i18n.fr).toBe("PNUD");
    expect(result!.i18n.ru).toBe("ПРООН");
  });

  it("WORLD BANK 映射到 World Bank", () => {
    const result = KNOWN_ACRONYMS.get("WORLD BANK");
    expect(result).toBeDefined();
    expect(result!.canonical).toBe("World Bank");
    expect(result!.i18n.zh).toBe("世界银行");
  });

  it("包含中文机构名键", () => {
    // 非洲联盟
    const result = KNOWN_ACRONYMS.get("\u975E\u6D32\u8054\u76DF");
    expect(result).toBeDefined();
    expect(result!.canonical).toBe("AU");
  });

  it("包含 OTHER 兜底条目", () => {
    const result = KNOWN_ACRONYMS.get("OTHER");
    expect(result).toBeDefined();
    expect(result!.i18n.zh).toBe("其他");
  });
});
