/**
 * 品目路径派生测试 — 「所见即所得」的语义内核
 * @module tests/unit/lib/services/commodity-path.test.ts
 * @description 这些用例是整个设计的地基：选中哪一层就只命中哪一层。
 *              段级粗码（41000000）的路径必须停在 "41"，所以选族 4101 命中不到它——
 *              这不是漏召回，是招标方只说到段；反过来选段 41 必须命中它。
 *              护栏：不得做最短前缀压缩（minimalCommodityPrefixes 是子树 LIKE 语义），
 *              压缩会把 "4101" 收成 "41"，让按族筛选静默丢公告。
 */
import { describe, it, expect } from "vitest";
import {
  isUnspscEight,
  unspscAncestorPrefixes,
  mergeAncestorPrefixes,
  leafPrefixesOf,
  groupCodesOfCodes,
  toPathColumn,
  parsePathColumn,
} from "@/lib/services/commodity/path";
import { WIDE_LIMITS } from "@/lib/utils/notice-field-limits";

describe("unspscAncestorPrefixes — 两位一组、遇 00 即停", () => {
  it("完整品目码出满四级", () => {
    expect(unspscAncestorPrefixes("10101501")).toEqual(["10", "1010", "101015", "10101501"]);
    expect(unspscAncestorPrefixes("72151001")).toEqual(["72", "7215", "721510", "72151001"]);
  });

  it("段级粗码只出段（停在 2 位）", () => {
    expect(unspscAncestorPrefixes("41000000")).toEqual(["41"]);
    expect(unspscAncestorPrefixes("10000000")).toEqual(["10"]); // 段 10：尾零不能吃掉有效位
    expect(unspscAncestorPrefixes("72000000")).toEqual(["72"]);
    expect(unspscAncestorPrefixes("80000000")).toEqual(["80"]);
  });

  it("族级码出段+族", () => {
    expect(unspscAncestorPrefixes("10100000")).toEqual(["10", "1010"]);
    expect(unspscAncestorPrefixes("41010000")).toEqual(["41", "4101"]);
  });

  it("类级码出段+族+类", () => {
    expect(unspscAncestorPrefixes("10101500")).toEqual(["10", "1010", "101015"]);
    expect(unspscAncestorPrefixes("43050100")).toEqual(["43", "4305", "430501"]);
  });

  it("非法码返回空数组（不猜、不兜底）", () => {
    for (const bad of ["4101", "410100000", "ABCDEFGH", "", "1010150", null, undefined]) {
      expect(unspscAncestorPrefixes(bad as string)).toEqual([]);
      expect(isUnspscEight(bad)).toBe(false);
    }
  });
});

describe("mergeAncestorPrefixes — 多码合并去重，不压缩", () => {
  it("同族两品目合并后仍保留族前缀（等值命中需要每一层都在）", () => {
    expect(mergeAncestorPrefixes(["10101501", "10101502"])).toEqual([
      "10",
      "1010",
      "101015",
      "10101501",
      "10101502",
    ]);
  });

  it("粗码与细码并存：段级 41000000 + 族级 41010000 → 41 与 4101 都在", () => {
    expect(mergeAncestorPrefixes(["41000000", "41010000"])).toEqual(["41", "4101"]);
  });

  it("★ 反例护栏：不得把子孙前缀压成最短祖先", () => {
    const merged = mergeAncestorPrefixes(["10101501"]);
    expect(merged).toContain("101015");
    expect(merged).not.toEqual(["10"]);
  });

  it("排序稳定（先位数再字典），便于逐条对账与快照比对", () => {
    expect(mergeAncestorPrefixes(["72151001", "10000000"])).toEqual(["10", "72", "7215", "721510", "72151001"]);
  });

  it("空输入与全非法 → 空数组", () => {
    expect(mergeAncestorPrefixes([])).toEqual([]);
    expect(mergeAncestorPrefixes(["xx", "1"])).toEqual([]);
  });
});

describe("叶子不限量：路径列必须是码集的无损函数", () => {
  /** 同一类下 90 个品目 + 另一类下 90 个品目 = 180 个叶子。
   *  注意末两位不能取 00：`10101500` 尾组全零，按「遇 00 即停」它是类级码不是叶子。 */
  const noisy = [
    ...Array.from({ length: 90 }, (_, i) => `101015${String(i + 1).padStart(2, "0")}`),
    ...Array.from({ length: 90 }, (_, i) => `101016${String(i + 1).padStart(2, "0")}`),
  ];

  it("180 个叶子全部保留，一个不丢", () => {
    // 2026-10-11 实测：全库不截断的最大列长 44,750 字符（公告 308834，5,167 项），
    // TEXT 容量 65,535，Meili 对单个属性的**值的个数**没有限制（只限单值 ≤ 468 字节）
    // ⇒ “截断才能活下去”的原前提不成立，改为不截断。
    const merged = mergeAncestorPrefixes(noisy);
    expect(merged.filter((p) => p.length === 8)).toHaveLength(180);
    expect(merged).toContain("101015");
    expect(merged).toContain("101016");
    expect(merged).toContain("1010");
    expect(merged).toContain("10");
  });

  it("真实规模的噪声公告（5,167 项）也能全量展开", () => {
    // 造可证明互异的 8 位叶子码：1010 + 类(2) + 品目(2，取 1..97 ⇒ 尾组永不为 00)
    const leaf = (i: number) => `1010${String(Math.floor(i / 97) + 1).padStart(2, "0")}${String((i % 97) + 1).padStart(2, "0")}`;
    const huge = Array.from({ length: 5167 }, (_, i) => leaf(i));
    const merged = mergeAncestorPrefixes(huge);
    expect(new Set(huge).size).toBe(5167);
    expect(merged.filter((p) => p.length === 8)).toHaveLength(5167);
    expect(merged.length).toBe(5167 + 54 + 2); // 叶子 + 54 个类 + 段/族两层
    // 不超列宽上限 ⇒ 一个不丢（上限留了多少余量，全靠这条用例钉住）
    expect(toPathColumn(merged).length).toBeLessThan(WIDE_LIMITS.commodityList);
    expect(() => toPathColumn(merged)).not.toThrow();
  });

  it("leafPrefixesOf 给的是真实叶数（供报告与对账）", () => {
    expect(leafPrefixesOf(noisy)).toHaveLength(180);
    expect(leafPrefixesOf(["41000000", "41010000"])).toEqual([]); // 粗码不产生叶子
  });

  it("只有超过列宽上限才拒写，绝不静默截断", () => {
    // 这是唯一允许的失败方式：超宽代表示常量与库漂移，必须停下来人工看
    const leaf = (i: number) => `1010${String(Math.floor(i / 97) + 1).padStart(2, "0")}${String((i % 97) + 1).padStart(2, "0")}`;
    const many = Array.from({ length: 1200 }, (_, i) => leaf(i));
    const path = mergeAncestorPrefixes(many);
    expect(path.filter((p) => p.length === 8)).toHaveLength(1200);
    expect(() => toPathColumn(path, 200)).toThrow(/拒绝截断写入/);
  });

  it("同一码集不管什么读取顺序，输出必须一模一样", () => {
    // 这条是「派生列是 code 的纯函数」的唯一护栏：回填脚本的回滚语义（脏了就重算，不需备份）
    // 全靠它成立。一旦哪天实现去掉了 leafPrefixesOf 里的 sort，两次回填写出两种值
    // ⇒ 对账永远无法收敛。
    const reversed = [...noisy].reverse();
    const everyThird = noisy.filter((_, i) => i % 3 !== 0).concat(noisy.filter((_, i) => i % 3 === 0));
    expect(mergeAncestorPrefixes(reversed)).toEqual(mergeAncestorPrefixes(noisy));
    expect(mergeAncestorPrefixes(everyThird)).toEqual(mergeAncestorPrefixes(noisy));
    expect(leafPrefixesOf(reversed)).toEqual(leafPrefixesOf(noisy));
  });
});

describe("groupCodesOfCodes — 大类并集（OR 语义）", () => {
  it("跨大类公告出多个大类码，按码升序去重", () => {
    expect(groupCodesOfCodes(["72000000", "30000000"])).toEqual(["UGT-G-05", "UGT-G-11"]);
  });

  it("同类多段只出一个大类", () => {
    // 32 类口径下 81 工程与 82 设计同属 UGT-G-14
    expect(groupCodesOfCodes(["81010000", "82000000"])).toEqual(["UGT-G-14"]);
  });

  it("★ 医疗四拆回归：41/42/51/85 不得再并回同一个大类", () => {
    // 旧 15 类口径里四段同居 G08（断言曾为 ["UGT-G-08"]）；重切后必须各自成类
    expect(groupCodesOfCodes(["41000000", "42010000", "51000000", "85000000"])).toEqual([
      "UGT-G-08", // 42 器械
      "UGT-G-18", // 41 仪器
      "UGT-G-25", // 85 医疗服务
      "UGT-G-26", // 51 药品
    ]);
  });

  it("未知段前缀直接丢弃（由对账脚本计数，不静默归入某个类）", () => {
    expect(groupCodesOfCodes(["99000000"])).toEqual([]);
  });
});

describe("toPathColumn / parsePathColumn — 写列与超长闸口", () => {
  it("逗号连接、无空格、可反解", () => {
    const s = toPathColumn(["41", "4101"]);
    expect(s).toBe("41,4101");
    expect(parsePathColumn(s)).toEqual(["41", "4101"]);
    expect(parsePathColumn("")).toEqual([]);
    expect(parsePathColumn(null)).toEqual([]);
  });

  it("超过上限抛错而非静默截断（截断=漏筛，必须停线）", () => {
    // 只验证拒写行为本身，不依赖常量具体数值（默认上限够不够用，
    // 由上面「5,167 项也能全量展开」那条用例按实测最脏公告钉死）
    expect(() => toPathColumn(["41", "4101", "410101"], 8)).toThrow(/截断写入/);
    expect(() => toPathColumn(["41", "4101", "410101"], 8)).toThrow(/超长/);
    expect(toPathColumn(["41", "4101", "410101"], 20)).toBe("41,4101,410101");
  });
});
