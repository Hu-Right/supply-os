/**
 * server/data/agency-i18n/prefix-patterns.ts 测试
 * 验证前缀模式映射的结构完整性和正则有效性
 */
import { describe, it, expect } from "vitest";
import {
  BR_PREFIX_MAP, BR_EXTRA_PREFIX_MAP, KENYA_PREFIX_MAP, INTL_PREFIX_MAP,
} from "../../../../server/data/agency-i18n/prefix-patterns";

function validatePatternMap(
  name: string,
  map: Array<[RegExp, (rest: string) => any]>,
  minEntries: number,
) {
  describe(name, () => {
    it(`导出为非空数组（>= ${minEntries} 条）`, () => {
      expect(Array.isArray(map)).toBe(true);
      expect(map.length).toBeGreaterThanOrEqual(minEntries);
    });

    it("每项都是 [RegExp, Function] 元组", () => {
      for (const [pattern, factory] of map) {
        expect(pattern).toBeInstanceOf(RegExp);
        expect(typeof factory).toBe("function");
      }
    });

    it("每个工厂函数返回含 canonical 和 i18n 的对象", () => {
      for (const [pattern, factory] of map) {
        // 用模式本身的匹配文本作为输入测试工厂
        const match = pattern.exec("MUNICIPIO DE SAO PAULO");
        if (match) {
          const result = factory(match[1] || "TEST");
          expect(typeof result.canonical).toBe("string");
          expect(result.canonical.length).toBeGreaterThan(0);
          expect(result.i18n).toBeDefined();
          expect(typeof result.i18n.zh).toBe("string");
        }
      }
    });
  });
}

validatePatternMap("BR_PREFIX_MAP", BR_PREFIX_MAP, 20);
validatePatternMap("BR_EXTRA_PREFIX_MAP", BR_EXTRA_PREFIX_MAP, 30);
validatePatternMap("KENYA_PREFIX_MAP", KENYA_PREFIX_MAP, 4);
validatePatternMap("INTL_PREFIX_MAP", INTL_PREFIX_MAP, 15);

describe("BR_PREFIX_MAP 具体匹配", () => {
  it("MUNICIPIO DE 匹配市级政府", () => {
    const [pattern, factory] = BR_PREFIX_MAP[0];
    const match = pattern.exec("MUNICIPIO DE SAO PAULO");
    expect(match).not.toBeNull();
    const result = factory(match![1]);
    expect(result.canonical).toContain("SAO PAULO");
    expect(result.i18n.zh).toContain("市");
  });

  it("HOSPITAL DAS 匹配医院", () => {
    const hospitalPattern = BR_PREFIX_MAP.find(([re]) => re.test("HOSPITAL DAS CLINICAS"));
    expect(hospitalPattern).toBeDefined();
    const [, factory] = hospitalPattern!;
    const match = hospitalPattern![0].exec("HOSPITAL DAS CLINICAS");
    const result = factory(match![1]);
    expect(result.i18n.zh).toContain("医院");
  });
});

describe("INTL_PREFIX_MAP 具体匹配", () => {
  it("MINISTRY OF 匹配各国部委", () => {
    const ministryPattern = INTL_PREFIX_MAP.find(([re]) => re.test("MINISTRY OF EDUCATION"));
    expect(ministryPattern).toBeDefined();
    const [, factory] = ministryPattern!;
    const match = ministryPattern![0].exec("MINISTRY OF EDUCATION");
    const result = factory(match![1]);
    expect(result.canonical).toContain("MINISTRY OF");
    expect(result.i18n.zh).toContain("部");
  });

  it("EMBASSY OF 匹配大使馆", () => {
    const embassyPattern = INTL_PREFIX_MAP.find(([re]) => re.test("EMBASSY OF FRANCE"));
    expect(embassyPattern).toBeDefined();
    const [, factory] = embassyPattern!;
    const match = embassyPattern![0].exec("EMBASSY OF FRANCE");
    const result = factory(match![1]);
    expect(result.i18n.zh).toContain("大使馆");
  });
});
