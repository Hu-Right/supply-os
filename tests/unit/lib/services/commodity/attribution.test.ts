/**
 * 公告品目归属落点纯函数单测（UNSPPSC 退役 R1）
 *
 * 钉住的三件事，每一件都是「静默改掉公告归属」的入口：
 * 1. `leafNodesOfPathColumn` 压出的最深落点集，必须能经祖先补全**逐条还原**原列
 *    （闸口 1 / 门禁 BB15c 用的就是这个闭包；不闭包就不许灌）；
 * 2. 列值的两个形制约束（全局升序、祖先全存）一旦破了，闭包就不成立 ⇒ 必须被抓出来人工定，
 *    而不是灌入时顺手"修好"——那是拿脏存量改掉现网归属；
 * 3. 脏 token 一律不产出、不猜测（与 `backboneNodeLevel` 的「形制不符返回 0」同一闸口）：
 *    放过 `UGT-B-XY` 就会让一条公告挂上不存在的节点，与相似公告脏码事故同源。
 */
import { describe, expect, it } from "vitest";
import {
  assertAttributionNode,
  closureOfPathColumn,
  leafNodesOfPathColumn,
  pathOfLandingNodes,
} from "@/lib/services/commodity/attribution";

describe("leafNodesOfPathColumn 取最深落点集", () => {
  it("祖先全存的列值压到最深链尾", () => {
    const col = "UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503,UGT-B-30,UGT-B-3011";
    expect(leafNodesOfPathColumn(col)).toEqual(["UGT-B-3011", "UGT-B-43211503"]);
  });

  it("同链中间断档不补猜：断点本身即落点", () => {
    expect(leafNodesOfPathColumn("UGT-B-43,UGT-B-432115")).toEqual(["UGT-B-432115"]);
  });

  it("脏 token 与空值都不产落点", () => {
    expect(leafNodesOfPathColumn(null)).toEqual([]);
    expect(leafNodesOfPathColumn("")).toEqual([]);
    expect(leafNodesOfPathColumn("721015,UGT-B-XY,UGT-B-43211503")).toEqual(["UGT-B-43211503"]);
  });

  it("同码重复只留一次", () => {
    expect(leafNodesOfPathColumn("UGT-B-43211503,UGT-B-43211503")).toEqual(["UGT-B-43211503"]);
  });

  it("兄弟链互不吞并：两条不同大类的链各留自己的最深码", () => {
    expect(leafNodesOfPathColumn("UGT-B-43,UGT-B-432102,UGT-B-44")).toEqual(["UGT-B-432102", "UGT-B-44"]);
  });
});

describe("pathOfLandingNodes 落点补全祖先", () => {
  it("单个 L5 落点摊成含全部祖先的升序集合", () => {
    expect(pathOfLandingNodes(["UGT-B-4321150301"])).toEqual([
      "UGT-B-43",
      "UGT-B-4321",
      "UGT-B-432115",
      "UGT-B-43211503",
      "UGT-B-4321150301",
    ]);
  });

  it("多落点共享祖先时并集去重", () => {
    const out = pathOfLandingNodes(["UGT-B-4321150301", "UGT-B-4321150302"]);
    expect(out.filter((x) => x === "UGT-B-43211503")).toHaveLength(1);
    expect(out).toEqual([...out].sort());
  });

  it("非法形制与空集都不猜：返回空集，调用方据此写 NULL", () => {
    expect(pathOfLandingNodes([])).toEqual([]);
    expect(pathOfLandingNodes(["721015", "UGT-B-XY", ""])).toEqual([]);
  });

  it("落点里同时给了祖先和后代时不重复出层级（祖先链由后代已覆盖）", () => {
    const out = pathOfLandingNodes(["UGT-B-43", "UGT-B-43211503"]);
    expect(out.filter((x) => x === "UGT-B-43")).toHaveLength(1);
    expect(out).toEqual(["UGT-B-43", "UGT-B-4321", "UGT-B-432115", "UGT-B-43211503"]);
  });
});

describe("closureOfPathColumn 对账闸口 1：灌入 + 重派生逐条不改归属", () => {
  // 真列的两个形制约束：全局升序 + 祖先全存（pathOf 的产出形状，BB10 重算也按此比）
  const cols = [
    "UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503",
    "UGT-B-07,UGT-B-0702,UGT-B-070201,UGT-B-07020102,UGT-B-0702010204",
    "UGT-B-30,UGT-B-3011",
    "UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503,UGT-B-4321150301,UGT-B-4321150302", // 同父两落点合并祖先
    "UGT-B-30,UGT-B-3011,UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503",
  ];
  it.each(cols)("闭包成立：%s", (col) => {
    expect(closureOfPathColumn(col)).toBe(col);
  });

  it("缺祖先的列不闭包：补全后会变长——历史脏列必须被抓出来，不静默改归属", () => {
    expect(closureOfPathColumn("UGT-B-43,UGT-B-43211503")).toBe("UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503");
    expect(closureOfPathColumn("UGT-B-4321150301")).toBe(
      "UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503,UGT-B-4321150301",
    );
  });

  it("非升序列不闭包：还原成 pathOf 的排序形状（闸口 1 会把这类行列出）", () => {
    expect(closureOfPathColumn("UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503,UGT-B-30,UGT-B-3011")).toBe(
      "UGT-B-30,UGT-B-3011,UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503",
    );
  });

  it("脏 token 列不闭包：还原后脏码消失，与 BB10「列里不许有脏值」同一判据", () => {
    expect(closureOfPathColumn("UGT-B-43,JUNK,UGT-B-4321")).toBe("UGT-B-43,UGT-B-4321");
  });

  it("空列闭包为空串（调用方据此写 NULL）", () => {
    expect(closureOfPathColumn("")).toBe("");
    expect(closureOfPathColumn(null)).toBe("");
  });
});

describe("assertAttributionNode 写前形制闸口", () => {
  it("合法节点码原样返回", () => {
    expect(assertAttributionNode("UGT-B-4321150301", 1001)).toBe("UGT-B-4321150301");
    expect(assertAttributionNode("UGT-B-43", 1001)).toBe("UGT-B-43");
  });

  it("脏形制抛错：静默丢行等于公告在新树上看起来不存在", () => {
    for (const bad of ["721015", "UGT-B-XY", "UGT-B-43211503010203", "UGT-C-43", "UGT-B-43211", "", null, 42]) {
      expect(() => assertAttributionNode(bad, 1001)).toThrow(/落点形制非法/);
    }
  });

  it("错误信息带公告主键，可定位", () => {
    expect(() => assertAttributionNode("721015", 1001)).toThrow("1001");
  });

  it("不 trim 脏入参（与 backboneNodeLevel 同一口径：带空白宁可判非法）", () => {
    expect(() => assertAttributionNode(" UGT-B-43", 1001)).toThrow(/落点形制非法/);
  });
});
