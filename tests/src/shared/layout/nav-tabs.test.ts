/**
 * src/shared/layout/nav-tabs.ts 测试
 * 验证导航配置的结构完整性
 */
import { describe, it, expect } from "vitest";
import { NAV_TABS, type NavTab } from "@/shared/layout/nav-tabs";

describe("NAV_TABS", () => {
  it("导出为非空数组", () => {
    expect(Array.isArray(NAV_TABS)).toBe(true);
    expect(NAV_TABS.length).toBeGreaterThan(0);
  });

  it("每个 tab 都有 path、labelKey、icon", () => {
    for (const tab of NAV_TABS) {
      expect(typeof tab.path).toBe("string");
      expect(tab.path.startsWith("/")).toBe(true);
      expect(typeof tab.labelKey).toBe("string");
      expect(typeof tab.icon).toBe("function"); // LucideIcon 是组件函数
    }
  });

  it("path 唯一不重复", () => {
    const paths = NAV_TABS.map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("包含核心导航路径", () => {
    const paths = new Set(NAV_TABS.map((t) => t.path));
    expect(paths.has("/procurement")).toBe(true);
    expect(paths.has("/membership")).toBe(true);
    expect(paths.has("/training")).toBe(true);
  });

  it("membership tab 有 highlight 标记", () => {
    const membership = NAV_TABS.find((t) => t.path === "/membership");
    expect(membership).toBeDefined();
    expect(membership!.highlight).toBe(true);
  });

  it("crm tab 有 alert 标记", () => {
    const crm = NAV_TABS.find((t) => t.path === "/crm");
    expect(crm).toBeDefined();
    expect(crm!.alert).toBe(true);
  });
});
