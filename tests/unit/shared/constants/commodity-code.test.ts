/**
 * shared/constants/commodity-code — 骨架码形制唯一实现的回归测试
 *
 * 2026-10 分层治理：该层从 lib/services/commodity（backbone-path / tree）下沉至
 * shared/constants，lib 侧改 shim 再导出。本测试直引 shared 入口，钉住：
 * - 形制判定（2/4/6/8/10 位，奇数位/脏 token 一律不认、不 trim 放水）；
 * - 祖先链纯切片（BB1 不变量）与五级定长形状；
 * - 旧面别字（UGT-B-）入口归一。
 */
import { describe, expect, it } from "vitest";
import {
  BACKBONE_NODE_PREFIX,
  backboneNodeLevel,
  isCommodityNodeKey,
  normalizeBackboneNodeKey,
  chainOfNode,
  commodityNodeLevel,
  commodityNodeChain,
  l1CodeOfNode,
} from "@/shared/constants/commodity-code";

describe("backboneNodeLevel / isCommodityNodeKey", () => {
  it.each([
    ["UGT-01", 1],
    ["UGT-0102", 2],
    ["UGT-010203", 3],
    ["UGT-01020304", 4],
    ["UGT-0102030405", 5],
  ])("合法码 %s → 层级 %d", (code, level) => {
    expect(backboneNodeLevel(code)).toBe(level);
    expect(isCommodityNodeKey(code)).toBe(true);
    expect(commodityNodeLevel(code)).toBe(level);
  });

  it.each(["", "UGT-", "UGT-0", "UGT-010", "UGT-XY", "UGT-010203040506", "UGT-01 ", " ugt-01", "XXX-01", "UGT-〇一", 42, null, undefined])(
    "形制不符一律判 0/非法：%j（不 trim 放水、奇数位不认、非字符串不猜）",
    (v) => {
      expect(backboneNodeLevel(v)).toBe(0);
      expect(isCommodityNodeKey(v)).toBe(false);
    },
  );

  it("尾随空格的脏码宁可判非法（原契约：形制不符不点亮）", () => {
    expect(isCommodityNodeKey("UGT-01 ")).toBe(false);
  });
});

describe("chainOfNode / commodityNodeChain", () => {
  it("祖先链浅→深纯切片（BB1：父码 = 自身去末两位）", () => {
    expect(chainOfNode("UGT-010203")).toEqual(["UGT-01", "UGT-0102", "UGT-010203"]);
    expect(chainOfNode("UGT-01")).toEqual(["UGT-01"]);
  });

  it("chainOfNode 入口容错：trim 后合法即放行，非法返回空数组", () => {
    expect(chainOfNode(" UGT-0102 ")).toEqual(["UGT-01", "UGT-0102"]);
    expect(chainOfNode("UGT-010")).toEqual([]);
    expect(chainOfNode(null)).toEqual([]);
  });

  it("commodityNodeChain 恒返五级定长形状，未选到的层为空串", () => {
    expect(commodityNodeChain("UGT-010203")).toEqual(["UGT-01", "UGT-0102", "UGT-010203", "", ""]);
    expect(commodityNodeChain("UGT-XY")).toEqual(["", "", "", "", ""]);
    expect(commodityNodeChain(null)).toEqual(["", "", "", "", ""]);
  });
});

describe("l1CodeOfNode", () => {
  it("任意深度取链首（大类身份 = L1 码）；非法键给空串（调用方按无大类处理，不猜）", () => {
    expect(l1CodeOfNode("UGT-010203")).toBe("UGT-01");
    expect(l1CodeOfNode("UGT-07")).toBe("UGT-07");
    expect(l1CodeOfNode("bad")).toBe("");
    expect(l1CodeOfNode(undefined)).toBe("");
  });
});

describe("normalizeBackboneNodeKey（旧面别字入口归一）", () => {
  it("UGT-B- 前缀剥成现行码；其余原样透传（含非字符串）", () => {
    expect(normalizeBackboneNodeKey("UGT-B-0102")).toBe(`${BACKBONE_NODE_PREFIX}0102`);
    expect(normalizeBackboneNodeKey("UGT-0102")).toBe("UGT-0102");
    expect(normalizeBackboneNodeKey(null)).toBe("");
    expect(normalizeBackboneNodeKey(undefined)).toBe("");
  });

  it("归一后的旧码可继续通过形制判定（入口链闭合）", () => {
    expect(isCommodityNodeKey(normalizeBackboneNodeKey("UGT-B-01"))).toBe(true);
  });
});
