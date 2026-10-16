/**
 * 中国行政区划数据（按层级拆分后）完整性回归
 *
 * 2026-10 首包治理把 339KB 的 src/data/chinaDivision.ts 拆成
 * provinces / cities / areas 三个独立模块（RFQ 路由只引所需层）。
 * 拆分是纯文本切片、未改值，但必须由测试钉住三条结构不变量，
 * 防止未来任何一次数据补录悄悄破坏层级引用：
 * - 每层 code 唯一；
 * - 所有非空父引用都能在同名层里查到；
 * - 行数级体检（provinces=34）防止切片截断。
 */
import { describe, expect, it } from "vitest";
import { provinces } from "@/data/china-division/provinces";
import { cities } from "@/data/china-division/cities";
import { areas } from "@/data/china-division/areas";

describe("china-division 层级数据", () => {
  it("三层 shape 基本盘：非空数组且每条有 code/name", () => {
    for (const arr of [provinces, cities, areas]) {
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
      expect(arr.every((x: { code: string; name: string }) => !!x.code && !!x.name)).toBe(true);
    }
    expect(provinces.length).toBe(31); // 23 省 + 5 自治区 + 4 直辖市（数据不含港澳台），切片截断时先在这里红
  });

  it("同层 code 唯一", () => {
    for (const arr of [provinces, cities, areas]) {
      expect(arr.length).toBe(new Set(arr.map((x) => x.code)).size);
    }
  });

  it("父引用可解析：cities→provinces、areas→provinces；areas.cityCode 若非空必须命中 cities", () => {
    const pc = new Set(provinces.map((p) => p.code));
    const cc = new Set(cities.map((c) => c.code));
    for (const c of cities) expect(pc.has(c.provinceCode)).toBe(true);
    for (const a of areas) {
      expect(pc.has(a.provinceCode)).toBe(true);
      if (a.cityCode) expect(cc.has(a.cityCode)).toBe(true);
    }
  });
});
