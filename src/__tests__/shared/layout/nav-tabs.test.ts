import { describe, it, expect } from "vitest";
import { NAV_TABS } from "@/shared/layout/nav-tabs";

describe("NAV_TABS（导航配置单一来源）", () => {
  it("contains the 7 main routes in display order", () => {
    expect(NAV_TABS.map((tab) => tab.path)).toEqual([
      "/showroom",
      "/procurement",
      "/supplier",
      "/crm",
      "/services",
      "/learning",
      "/membership",
    ]);
  });

  it("has unique paths (path is the single key)", () => {
    const paths = NAV_TABS.map((tab) => tab.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every tab carries a labelKey and an icon", () => {
    for (const tab of NAV_TABS) {
      expect(typeof tab.labelKey).toBe("string");
      expect(tab.labelKey.length).toBeGreaterThan(0);
      expect(tab.icon).toBeTruthy();
    }
  });

  it("mobile bottom bar shows exactly the 5 expected tabs", () => {
    const mobilePaths = NAV_TABS.filter((tab) => tab.mobile).map((tab) => tab.path);
    expect(mobilePaths).toEqual(["/showroom", "/procurement", "/supplier", "/crm", "/learning"]);
  });

  it("mobile tabs provide short labels", () => {
    for (const tab of NAV_TABS.filter((t) => t.mobile)) {
      expect(tab.shortLabelKey).toBeTruthy();
    }
  });

  it("marks CRM alert and membership highlight", () => {
    const crm = NAV_TABS.find((tab) => tab.path === "/crm");
    const membership = NAV_TABS.find((tab) => tab.path === "/membership");
    expect(crm?.alert).toBe(true);
    expect(membership?.highlight).toBe(true);
    // 其他 tab 无告警/高亮标记
    expect(NAV_TABS.filter((tab) => tab.alert)).toHaveLength(1);
    expect(NAV_TABS.filter((tab) => tab.highlight)).toHaveLength(1);
  });
});
