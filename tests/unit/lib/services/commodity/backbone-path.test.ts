/**
 * 骨架节点访问器单测（旧品类码全面退役 R4'）
 *
 * 覆盖：UGT 节点直认（等值命中 + 祖先全存 + 层级档按码长现算）、换不出必须进 misses、
 *       纯切片工具（chainOfNode / rootNodes / fromBackbonePathColumn / backboneNodeLevel）
 *       与列形制工具。
 *
 * 与旧用例的差别：小表剥离上线日迁移后 `crm_user_interest_codes` / `crm_supplier_backbone_interests`
 * 里所有 code 都是 `UGT-*`，运行期再无数字码入口 ⇒ 四条换算规则（品目/类/族/段）与
 * 常量兜底（deriveSegmentRows）都从测试面退场；`match()` 只保留 UGT 直认一条分支。
 */
import { describe, expect, it } from "vitest";
import {
  assertBackbonePathLength,
  backboneNodeLevel,
  buildBackboneIndex,
  chainOfNode,
  deriveSegmentRows,
  fromBackbonePathColumn,
  normalizeBackboneNodeKey,
  rootNodes,
  toBackbonePathColumn,
  type BackboneRow,
} from "@/lib/services/commodity/backbone-path";

// 一棵够小的树：1 大类 / 1 中类 / 2 小类 / 2 子类 / 3 品目（R4' 后无旧前缀映射列字段）
const rows: BackboneRow[] = [
  { code: "UGT-01", parentCode: "", level: 1 },
  { code: "UGT-0101", parentCode: "UGT-01", level: 2 },
  { code: "UGT-010101", parentCode: "UGT-0101", level: 3 },
  { code: "UGT-010102", parentCode: "UGT-0101", level: 3 },
  { code: "UGT-01010101", parentCode: "UGT-010101", level: 4 },
  { code: "UGT-01010201", parentCode: "UGT-010102", level: 4 },
  { code: "UGT-0101010101", parentCode: "UGT-01010101", level: 5 },
  { code: "UGT-0101010102", parentCode: "UGT-01010101", level: 5 },
  { code: "UGT-0101020101", parentCode: "UGT-01010201", level: 5 },
];
const idx = buildBackboneIndex(rows);

describe("UGT 节点直认（R4' 后唯一分支）", () => {
  it("L5 命中：祖先全存、不进 misses、层级档按码长现算", () => {
    const r = idx.pathOf(["UGT-0101010101"]);
    expect(r.deepest).toEqual(["UGT-0101010101"]);
    expect(r.codes).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]);
    expect(r.tiers["品目级"]).toBe(1);
    expect(r.misses).toEqual([]);
  });

  it("L4/L3/L2/L1 各层直认，档位标记随码长切换", () => {
    expect(idx.match("UGT-01010101")?.tier).toBe("类级");
    expect(idx.match("UGT-010101")?.tier).toBe("族级");
    expect(idx.match("UGT-0101")?.tier).toBe("段级");
    expect(idx.match("UGT-01")?.tier).toBe("段级");
  });

  it("形制合法但树上无此键 → miss（宁缺勿错，不猜最近节点）", () => {
    const r = idx.pathOf(["UGT-99"]);
    expect(r.deepest).toEqual([]);
    expect(r.misses).toEqual(["UGT-99"]);
  });

  it("脏 token 与数字码一律 miss（R4' 后数字码入口不再存在）", () => {
    const r = idx.pathOf(["10101510", "10", "ABCDEFGH", "", "  ", "UGT-XY"]);
    expect(r.codes).toEqual([]);
    expect(r.misses).toHaveLength(6);
  });

  it("同支两个码共享祖先，节点不重复", () => {
    const r = idx.pathOf(["UGT-0101010101", "UGT-0101010102"]);
    expect(r.deepest).toEqual(["UGT-0101010101", "UGT-0101010102"]);
    expect(r.codes).toEqual([
      "UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101", "UGT-0101010102",
    ]);
  });

  it("深层覆盖浅层但浅层节点仍在（列值祖先全存 ⇒ 任意一层都能等值筛到）", () => {
    const r = idx.pathOf(["UGT-01010101", "UGT-0101020101"]);
    expect(r.codes).toContain("UGT-01010101");
    expect(r.codes).toContain("UGT-010102");
    expect(r.codes).toContain("UGT-01");
  });
});

describe("buildBackboneIndex 的 segments 入参（R4' 保留但不消费）", () => {
  it("传空数组也能构出索引，行为与不传一致", () => {
    const withEmpty = buildBackboneIndex(rows, []);
    const without = buildBackboneIndex(rows);
    expect(withEmpty.size).toBe(without.size);
    expect(withEmpty.match("UGT-0101010101")?.row.code).toBe(without.match("UGT-0101010101")?.row.code);
  });
});

describe("deriveSegmentRows 的空实现（R4' 后无消费方）", () => {
  it("传任意行集都返回空数组（历史 API，下一轮连根删）", () => {
    expect(deriveSegmentRows([])).toEqual([]);
    expect(deriveSegmentRows([{ code: "UGT-01", level: 1, group_code: "UGT-G-01" }])).toEqual([]);
  });
});

describe("rootNodes：多值 OR 谓词的最浅覆盖集", () => {
  it("集合里有祖先就把深层去掉（列值祖先全存 ⇒ 并集不变）", () => {
    expect(rootNodes(["UGT-01", "UGT-0102", "UGT-010203"])).toEqual(["UGT-01"]);
    expect(rootNodes(["UGT-0102", "UGT-010203"])).toEqual(["UGT-0102"]);
  });

  it("不相关的节点全部保留，结果按码序且可复现", () => {
    const a = rootNodes(["UGT-0203", "UGT-0102", "UGT-0102", "UGT-05"]);
    expect(a).toEqual(["UGT-0102", "UGT-0203", "UGT-05"]);
    expect(rootNodes(a)).toEqual(a); // 已压集的集合再过一次不变
  });

  it("脏 token 不进集（形制判定只认 backboneNodeLevel）", () => {
    expect(rootNodes(["UGT-XY", "42101503", "", "UGT-01"])).toEqual(["UGT-01"]);
  });

  it("兄弟不互相覆盖：同父不同子两个都留", () => {
    expect(rootNodes(["UGT-0102", "UGT-0103"])).toEqual(["UGT-0102", "UGT-0103"]);
  });
});

describe("列形制与超长拒写", () => {
  it("toBackbonePathColumn / assertBackbonePathLength 契约", () => {
    expect(toBackbonePathColumn(["UGT-01", "UGT-0101"])).toBe("UGT-01,UGT-0101");
    expect(() => assertBackbonePathLength("x".repeat(1_000_001), 42)).toThrow(/超长/);
    expect(assertBackbonePathLength("x".repeat(1000), 42)).toHaveLength(1000);
  });
});

describe("纯切片工具（与 match 数字码入口解耦，独立保留）", () => {
  it("chainOfNode：节点码纯切片，L5 给五级、L1 只给自己", () => {
    expect(chainOfNode("UGT-0702010204")).toEqual([
      "UGT-07", "UGT-0702", "UGT-070201", "UGT-07020102", "UGT-0702010204",
    ]);
    expect(chainOfNode("UGT-07")).toEqual(["UGT-07"]);
  });

  it("fromBackbonePathColumn：与 toBackbonePathColumn 往返，NULL/空串/野 token 不炸", () => {
    const codes = ["UGT-01", "UGT-0101", "UGT-01010101"];
    expect(fromBackbonePathColumn(toBackbonePathColumn(codes))).toEqual(codes);
    expect(fromBackbonePathColumn(null)).toEqual([]);
    expect(fromBackbonePathColumn("")).toEqual([]);
    // 去重 + 丢非树码（旧 UGT-C- 尾巴、空段）
    expect(fromBackbonePathColumn("UGT-01,UGT-01,,UGT-C-0702")).toEqual(["UGT-01"]);
  });

  // 形制判定必须比「startsWith(前缀)」紧：否则脏 token 会被当成合法层级使，
  // 两个同样脏的码直接就能得出一条不存在的相似公告
  it("backboneNodeLevel：只认前缀 + 偶数位数字，其它一律 0", () => {
    expect(backboneNodeLevel("UGT-07")).toBe(1);
    expect(backboneNodeLevel("UGT-0702010204")).toBe(5);
    expect(backboneNodeLevel("UGT-XY")).toBe(0); // 非数字
    expect(backboneNodeLevel("UGT-0")).toBe(0); // 奇数位
    expect(backboneNodeLevel("UGT-010101010101")).toBe(0); // 超 10 位
    expect(backboneNodeLevel(" UGT-07 ")).toBe(0); // 带空格：宁判非法
    // 2026-10-13 改码前的旧形制（带面别字）必须判非法：否则存量旧码会被当成合法层级使
    expect(backboneNodeLevel("UGT-B-07")).toBe(0);
    expect(backboneNodeLevel(null)).toBe(0);
    expect(backboneNodeLevel(7)).toBe(0);
  });

  it("fromBackbonePathColumn 丢弃形制不符的脏 token", () => {
    expect(fromBackbonePathColumn("UGT-01,UGT-XY,UGT-0, ,UGT-0101")).toEqual(["UGT-01", "UGT-0101"]);
  });

  // 旧外链兼容面只此一处：只换前缀，位数一位不动（旧 UGT-B-0102 → 新 UGT-0102 同层）。
  // 不钉住它，下次改码又会变成"入口归一了、下游不认"或者反过来。
  it("normalizeBackboneNodeKey：入口层认旧码，现行码幂等，脏值不猜", () => {
    expect(normalizeBackboneNodeKey("UGT-B-07")).toBe("UGT-07");
    expect(normalizeBackboneNodeKey("UGT-B-0702010204")).toBe("UGT-0702010204");
    expect(normalizeBackboneNodeKey("UGT-07")).toBe("UGT-07"); // 现行码原样
    expect(normalizeBackboneNodeKey("UGT-XY")).toBe("UGT-XY"); // 不归一脏值，交给形制判定拒收
    expect(normalizeBackboneNodeKey(null)).toBe("");
    // 归一之后必须能被形制判定接住：入口 → 判定的接力不能断
    expect(backboneNodeLevel(normalizeBackboneNodeKey("UGT-B-0702"))).toBe(2);
  });
});
