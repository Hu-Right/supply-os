/**
 * 融合标准码制内核单测 —— 钉死四家"码长即层级 + 前缀即父子"，
 * 使 FU4 单调归属可离线机检。用例覆盖：合法定层、补位归一、跨层祖先、同层非父、脏码拒判。
 */
import { describe, expect, it } from "vitest";
import {
  normalizeStdCode,
  stdLevel,
  stdParentCode,
  isAxisAncestor,
  isValidStdCode,
  STD_MAX_LEVEL,
} from "@/lib/services/commodity/fusion-standards";

describe("fusion-standards UNSPSC", () => {
  it("补位段→定层1，有效码去尾零", () => {
    expect(normalizeStdCode("unspsc", "10")).toEqual({ sig: "10", level: 1 });
    expect(normalizeStdCode("unspsc", "10000000")).toEqual({ sig: "10", level: 1 });
    expect(normalizeStdCode("unspsc", "10012005")).toEqual({ sig: "10012005", level: 4 });
  });
  it("含 00 组的中间码非法（不可当有效层）", () => {
    expect(isValidStdCode("unspsc", "10002005")).toBe(false); // 族位 00
  });
  it("祖先：段→商品、类→商品为真，商品自身非父", () => {
    expect(isAxisAncestor("unspsc", "10", "10012005")).toBe(true);
    expect(isAxisAncestor("unspsc", "100120", "10012005")).toBe(true);
    expect(isAxisAncestor("unspsc", "10012005", "10012005")).toBe(false);
    expect(isAxisAncestor("unspsc", "10012006", "10012005")).toBe(false);
  });
  it("父码逐层回退", () => {
    expect(stdParentCode("unspsc", "10012005")).toBe("100120");
    expect(stdParentCode("unspsc", "10")).toBe("");
  });
});

describe("fusion-standards HS / eCl@ss / CPC", () => {
  it("HS 6 位三层", () => {
    expect(stdLevel("hs", "01")).toBe(1);
    expect(stdLevel("hs", "0101")).toBe(2);
    expect(stdLevel("hs", "010121")).toBe(3);
    expect(isAxisAncestor("hs", "01", "010121")).toBe(true);
    expect(isAxisAncestor("hs", "0101", "010221")).toBe(false);
    expect(isAxisAncestor("hs", "010", "010121")).toBe(false); // 奇数位非法
  });
  it("eCl@ss 8 位四层", () => {
    expect(stdLevel("eclss", "27")).toBe(1);
    expect(stdLevel("eclss", "2740")).toBe(2);
    expect(stdLevel("eclss", "27402700")).toBe(4);
    expect(isAxisAncestor("eclss", "2740", "27402700")).toBe(true);
  });
  it("CPC 1~5 位逐层", () => {
    expect(stdLevel("cpc", "1")).toBe(1);
    expect(stdLevel("cpc", "12345")).toBe(5);
    expect(isAxisAncestor("cpc", "12", "12345")).toBe(true);
    expect(isAxisAncestor("cpc", "12", "12")).toBe(false);
    expect(stdParentCode("cpc", "123")).toBe("12");
    expect(stdLevel("cpc", "123456")).toBe(0); // 超 5 位非法
  });
});

describe("fusion-standards 边界与元数据", () => {
  it("跨标准不可比、脏码一律拒判（交人工）", () => {
    expect(isAxisAncestor("hs", "abc", "010121")).toBe(false);
    expect(isAxisAncestor("unspsc", "", "10")).toBe(false);
    expect(normalizeStdCode("cpc", null)).toEqual({ sig: "", level: 0 });
  });
  it("最大层数表", () => {
    expect(STD_MAX_LEVEL).toEqual({ unspsc: 4, hs: 3, eclss: 4, cpc: 5 });
  });
});
