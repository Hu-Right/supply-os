/**
 * 融合树码制单测 — 钉死"码长即层级、更深=前缀"两条承重不变量。
 * 与旧 backbone-path（UGT-B-/2 位）物理隔离：本文件断言任何 UGT-B-/UGT-C-/UGT-G- 一律判非法，
 * 防两套前缀混淆（脏码直接得高分 = 相似公告事故的根因）。
 */
import { describe, expect, it } from "vitest";
import {
  isFusionNode,
  fusionNodeLevel,
  chainOfFusionNode,
  fusionSubtreeLike,
  minimalFusionPrefixes,
  toFusionPathColumn,
  fromFusionPathColumn,
  leafNodesOfFusionPathColumn,
  assertFusionPathLength,
  FUSION_NODE_PREFIX,
} from "@/lib/services/commodity/fusion-path";

describe("fusion-path 形制不变量", () => {
  it("合法码识别：UGT- 后 3 的倍数位", () => {
    expect(isFusionNode("UGT-043")).toBe(true);
    expect(isFusionNode("UGT-043115")).toBe(true);
    expect(isFusionNode("UGT-043115003")).toBe(true);
    expect(isFusionNode("UGT-04")).toBe(false); // 非 3 倍数
    expect(isFusionNode("UGT-04x")).toBe(false); // 非数字
    expect(isFusionNode("UGT-B-043")).toBe(false); // 旧前缀必须拒
  });

  it("层级 = (len-4)/3", () => {
    expect(fusionNodeLevel("UGT-043")).toBe(1);
    expect(fusionNodeLevel("UGT-043115")).toBe(2);
    expect(fusionNodeLevel("UGT-043115003")).toBe(3);
    expect(fusionNodeLevel("UGT-BAD")).toBe(0);
  });

  it("祖先链逐 3 位前移，含自身", () => {
    expect(chainOfFusionNode("UGT-043115003")).toEqual(["UGT-043", "UGT-043115", "UGT-043115003"]);
    expect(chainOfFusionNode("UGT-B-043")).toEqual([]);
  });

  it("子树 LIKE = 码%", () => {
    expect(fusionSubtreeLike("UGT-043115")).toBe("UGT-043115%");
  });

  it("最短前缀去重：留祖先弃子孙", () => {
    expect(minimalFusionPrefixes(["UGT-043", "UGT-043115", "UGT-301"])).toEqual(["UGT-043", "UGT-301"]);
  });

  it("列值往返：产出去重升序，解析只留合法 UGT- token", () => {
    const col = toFusionPathColumn(["UGT-043115", "UGT-043", "UGT-301"]);
    expect(col).toBe("UGT-043,UGT-043115,UGT-301");
    expect(fromFusionPathColumn("UGT-043,UGT-B-99,UGT-043115")).toEqual(["UGT-043", "UGT-043115"]);
    expect(fromFusionPathColumn(null)).toEqual([]);
  });

  it("压最深链尾：脏 token 不产出", () => {
    const col = "UGT-043,UGT-043115,UGT-043115003,UGT-301,UGT-301102";
    expect(leafNodesOfFusionPathColumn(col).sort()).toEqual(["UGT-043115003", "UGT-301102"]);
  });

  it("超长抛错", () => {
    expect(() => assertFusionPathLength(FUSION_NODE_PREFIX + "0".repeat(2_000_000), 1)).toThrow();
  });
});
