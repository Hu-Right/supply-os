/**
 * 品目大类展示名 locale 覆盖单测
 *
 * 纪律：类表唯一事实源是 src/lib/services/commodity/groups.ts，前端 chip 的名字走
 * locale 键 commodityGroup_<大类码>。拆类/并类时最容易忘的就是「常量改了、locale 没加」，
 * 而 check-i18n 只保证六语言键一致，不保证「每个大类都有名字」—— 这条由本用例兜住。
 * （六语言之间的键一致性由 scripts/gates/check-i18n.ts 负责，不在此重复。）
 */
import { describe, it, expect } from "vitest";
import { COMMODITY_GROUPS } from "@/lib/services/commodity/groups";
import zhCommon from "@/core/i18n/locales/zh/common.json";

const names = zhCommon as Record<string, string>;

describe("品目大类展示名 locale 覆盖", () => {
  it("32 个大类在 zh locale 里都有非空展示名", () => {
    const missing = COMMODITY_GROUPS.filter(
      (g) => !String(names[`commodityGroup_${g.code}`] || "").trim(),
    ).map((g) => g.code);
    expect(missing).toEqual([]);
  });

  it("locale 里没有游离的大类键（类表退役后必须一起删）", () => {
    const codes = new Set(COMMODITY_GROUPS.map((g) => g.code));
    const orphans = Object.keys(names)
      .filter((k) => k.startsWith("commodityGroup_"))
      .map((k) => k.slice("commodityGroup_".length))
      .filter((code) => !codes.has(code));
    expect(orphans).toEqual([]);
  });

  it("大类名不重复（两类同名会让 chip 无法区分）", () => {
    const list = COMMODITY_GROUPS.map((g) => names[`commodityGroup_${g.code}`]);
    expect(new Set(list).size).toBe(COMMODITY_GROUPS.length);
  });
});
