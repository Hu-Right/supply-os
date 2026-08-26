/**
 * server/data/agency-i18n/aliases.ts 测试
 * 验证机构别名映射种子数据的完整性和结构正确性
 */
import { describe, it, expect } from "vitest";
import { AGENCY_ALIAS_GROUPS, type AgencyAliasGroup } from "../../../../server/data/agency-i18n/aliases";

describe("AGENCY_ALIAS_GROUPS", () => {
  it("导出为非空数组", () => {
    expect(Array.isArray(AGENCY_ALIAS_GROUPS)).toBe(true);
    expect(AGENCY_ALIAS_GROUPS.length).toBeGreaterThan(0);
  });

  it("每组都有 canonical 字段且非空字符串", () => {
    for (const group of AGENCY_ALIAS_GROUPS) {
      expect(typeof group.canonical).toBe("string");
      expect(group.canonical.trim().length).toBeGreaterThan(0);
    }
  });

  it("每组都有非空 aliases 数组", () => {
    for (const group of AGENCY_ALIAS_GROUPS) {
      expect(Array.isArray(group.aliases)).toBe(true);
      expect(group.aliases.length).toBeGreaterThan(0);
      for (const alias of group.aliases) {
        expect(typeof alias).toBe("string");
        expect(alias.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("aliases 全部为大写", () => {
    for (const group of AGENCY_ALIAS_GROUPS) {
      for (const alias of group.aliases) {
        expect(alias).toBe(alias.toUpperCase());
      }
    }
  });

  it("每组都有 i18n 字段且至少包含 zh 翻译", () => {
    for (const group of AGENCY_ALIAS_GROUPS) {
      expect(group.i18n).toBeDefined();
      expect(typeof group.i18n.zh).toBe("string");
      expect(group.i18n.zh!.trim().length).toBeGreaterThan(0);
    }
  });

  it("canonical 名称唯一不重复", () => {
    const canonicals = AGENCY_ALIAS_GROUPS.map((g) => g.canonical);
    const unique = new Set(canonicals);
    expect(unique.size).toBe(canonicals.length);
  });

  it("包含核心联合国机构", () => {
    const canonicals = new Set(AGENCY_ALIAS_GROUPS.map((g) => g.canonical));
    expect(canonicals.has("UNDP")).toBe(true);
    expect(canonicals.has("WHO")).toBe(true);
    expect(canonicals.has("UNICEF")).toBe(true);
    expect(canonicals.has("WFP")).toBe(true);
    expect(canonicals.has("World Bank")).toBe(true);
  });

  it("UNDP 的别名包含全称变体", () => {
    const undp = AGENCY_ALIAS_GROUPS.find((g) => g.canonical === "UNDP");
    expect(undp).toBeDefined();
    expect(undp!.aliases).toContain("UNITED NATIONS DEVELOPMENT PROGRAMME");
    expect(undp!.aliases).toContain("UNITED NATIONS DEVELOPMENT PROGRAM");
    expect(undp!.i18n.zh).toBe("联合国开发计划署");
    expect(undp!.i18n.fr).toBe("PNUD");
  });
});
