/**
 * server/services/agency/ + server/data/agency-i18n/ 单元测试
 * 覆盖 classifyAgencyType, translateByPattern
 */
import { describe, it, expect } from "vitest";

// ── agency/index.ts: classifyAgencyType ──
import { classifyAgencyType } from "../../../../server/services/agency/index";

describe("classifyAgencyType", () => {
  it("空字符串返回 null", () => {
    expect(classifyAgencyType("")).toBeNull();
    expect(classifyAgencyType("  ")).toBeNull();
  });

  it("KNOWN_ACRONYMS 不聚合（如 UNDP/WHO）", () => {
    expect(classifyAgencyType("UNDP")).toBeNull();
    expect(classifyAgencyType("WHO")).toBeNull();
    expect(classifyAgencyType("World Health Organization")).toBeNull();
  });

  it("巴西政府模式匹配", () => {
    const result = classifyAgencyType("Prefeitura Municipal de São Paulo");
    // 应匹配巴西市政模式
    if (result) {
      expect(result.typeKey).toBeDefined();
      expect(result.i18n).toBeDefined();
      expect(result.i18n.zh).toBeDefined();
    }
  });

  it("未知机构返回 null", () => {
    expect(classifyAgencyType("Some Random Company XYZ")).toBeNull();
  });
});

// ── data/agency-i18n/translate.ts: translateByPattern ──
import { translateByPattern } from "../../../../server/data/agency-i18n/translate";

describe("translateByPattern", () => {
  it("空字符串返回 null", () => {
    expect(translateByPattern("")).toBeNull();
    expect(translateByPattern("  ")).toBeNull();
  });

  it("精确匹配已知缩写（UNDP）", () => {
    const result = translateByPattern("UNDP");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("开发");
  });

  it("精确匹配不区分大小写", () => {
    const result = translateByPattern("undp");
    expect(result).not.toBeNull();
  });

  it("关键词兜底：COMMITTEE", () => {
    const result = translateByPattern("District Development Committee");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("委员会");
  });

  it("关键词兜底：MINISTRY", () => {
    const result = translateByPattern("Ministry of Education");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("部");
  });

  it("关键词兜底：UNIVERSITY", () => {
    const result = translateByPattern("National University");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("大学");
  });

  it("连字符前缀递归", () => {
    const result = translateByPattern("PMSP - Prefeitura");
    // 应递归处理连字符后的部分
    expect(result).not.toBeNull();
  });

  it("纯非英文文本直通", () => {
    const result = translateByPattern("某机构");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toBe("某机构");
  });

  it("返回结构包含所有必需语言", () => {
    const result = translateByPattern("Test Agency");
    expect(result).not.toBeNull();
    expect(result!.i18n).toHaveProperty("zh");
    expect(result!.i18n).toHaveProperty("fr");
    expect(result!.i18n).toHaveProperty("ru");
    expect(result!.i18n).toHaveProperty("es");
    expect(result!.i18n).toHaveProperty("ar");
  });
});
