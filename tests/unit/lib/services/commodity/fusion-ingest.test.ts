/**
 * 结构脚手架内核单测 —— 断言"按 std 官方父子规则铺出的 UGT 骨架结构绝对正确"：
 * 每条边过 collectEdgeViolations 无 fatal；缺中间层→orphan；同码→冲突；跨标准示例正确定层。
 * ⚠ 用例用合成记录，只验结构，不代表真实世界码义（语义正名/审批是人审的事）。
 */
import { describe, expect, it } from "vitest";
import { scaffoldSubtree, type StdRecord } from "@/lib/services/commodity/fusion-ingest";
import { collectEdgeViolations, hasFatal } from "@/lib/services/commodity/fusion-tree";

describe("scaffoldSubtree · UNSPSC 段10 子树", () => {
  const records: StdRecord[] = [
    { code: "1001", name_zh: "FamA" },
    { code: "1002", name_zh: "FamB" },
    { code: "100120", name_zh: "ClassA1" },
  ];
  const res = scaffoldSubtree({ rootCode: "UGT-043", axisStd: "unspsc", rootAxisCode: "10", groupCode: "UGT-G-07", records });

  it("根 + 2 族(L2) + 1 类(L3)，层级连续", () => {
    expect(res.nodes).toHaveLength(4);
    expect(res.nodes.map((n) => n.level)).toEqual([1, 2, 2, 3]);
  });
  it("兄弟按码升序赋 001/002；类挂在族1001 下", () => {
    expect(res.byCode.get("1001")).toBe("UGT-043001");
    expect(res.byCode.get("1002")).toBe("UGT-043002");
    expect(res.byCode.get("100120")).toBe("UGT-043001001");
    const cls = res.nodes.find((n) => n.axis_code === "100120")!;
    expect(cls.parent_code).toBe("UGT-043001");
  });
  it("结构内核复核：整棵树无 fatal（单调归属天然成立）", () => {
    expect(hasFatal(collectEdgeViolations(res.nodes))).toBe(false);
  });
});

describe("scaffoldSubtree · 异常与边界", () => {
  it("缺中间层 → orphan（绝不自动补/猜挂）", () => {
    const res = scaffoldSubtree({ rootCode: "UGT-043", axisStd: "unspsc", rootAxisCode: "10", groupCode: "UGT-G-07", records: [{ code: "100120", name_zh: "Class" }] });
    expect(res.orphans.some((o) => o.code === "100120" && /父记录/.test(o.reason))).toBe(true);
    expect(res.byCode.has("100120")).toBe(false);
  });
  it("同有效码重复（补位等价）→ 冲突记一条", () => {
    const res = scaffoldSubtree({ rootCode: "UGT-043", axisStd: "unspsc", rootAxisCode: "10", groupCode: "UGT-G-07", records: [{ code: "1001", name_zh: "A" }, { code: "10010000", name_zh: "A'" }] });
    expect(res.orphans.some((o) => /同码重复/.test(o.reason))).toBe(true);
    expect(res.nodes.filter((n) => n.axis_code === "1001")).toHaveLength(1);
  });
  it("根码非 L1 → 直接判失败", () => {
    const res = scaffoldSubtree({ rootCode: "UGT-043115", axisStd: "unspsc", rootAxisCode: "10", groupCode: "UGT-G-07", records: [] });
    expect(res.nodes).toHaveLength(0);
    expect(res.orphans[0].reason).toMatch(/L1/);
  });
});

describe("scaffoldSubtree · HS 章01 子树", () => {
  it("章1→品目2→子目3 定层正确且无 fatal", () => {
    const res = scaffoldSubtree({ rootCode: "UGT-007", axisStd: "hs", rootAxisCode: "01", groupCode: "UGT-G-01", records: [{ code: "0101", name_zh: "Horse" }, { code: "010121", name_zh: "Purebred" }] });
    expect(res.nodes.map((n) => n.level)).toEqual([1, 2, 3]);
    expect(res.byCode.get("010121")).toBe("UGT-007001001");
    expect(hasFatal(collectEdgeViolations(res.nodes))).toBe(false);
  });
});
