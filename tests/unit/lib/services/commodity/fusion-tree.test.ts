/**
 * 融合建树引擎单测 —— 钉住"结构 FU1 + 单调 FU4 同标准机检 fatal + 跨标准路由 human"三条判据。
 * 关键回归：同标准下"牛头不对马嘴"（父 axis 非子祖先）必须 fatal；跨标准不得自动放行，必须送 human。
 */
import { describe, expect, it } from "vitest";
import {
  validateFusionEdge,
  collectEdgeViolations,
  expectedParentCode,
  hasFatal,
  groupL1Coverage,
  type FusionRow,
} from "@/lib/services/commodity/fusion-tree";

const L1: FusionRow = { code: "UGT-043", parent_code: "", level: 1, group_code: "UGT-G-07", axis_std: "unspsc", axis_code: "10" };
const L2ok: FusionRow = { code: "UGT-043115", parent_code: "UGT-043", level: 2, group_code: "UGT-G-07", axis_std: "unspsc", axis_code: "1001" };

describe("validateFusionEdge 结构", () => {
  it("合法链清白", () => {
    expect(validateFusionEdge(L2ok, L1)).toEqual({ fatal: [], human: [] });
  });
  it("父码≠去末3位 → fatal", () => {
    const bad = { ...L2ok, parent_code: "UGT-999" };
    expect(validateFusionEdge(bad, L1).fatal.join()).toMatch(/去末3位/);
  });
  it("层级与码长不符 → fatal", () => {
    expect(validateFusionEdge({ ...L2ok, level: 4 }, L1).fatal.join()).toMatch(/层级与码长不符/);
  });
  it("大类 group 为空 → fatal", () => {
    expect(validateFusionEdge({ ...L1, group_code: "" }, null).fatal.join()).toMatch(/group_code/);
  });
});

describe("validateFusionEdge 单调归属", () => {
  it("同标准·父 axis 非子祖先 → fatal（牛头不对马嘴被机检抓住）", () => {
    const wrongAxis = { ...L2ok, axis_code: "2001" }; // 与父 "10" 不同段
    expect(validateFusionEdge(wrongAxis, L1).fatal.join()).toMatch(/单调归属破坏/);
  });
  it("同标准·子确为父后代 → 清白", () => {
    const ok = { ...L2ok, axis_code: "1001" };
    expect(validateFusionEdge(ok, L1).fatal).toHaveLength(0);
  });
  it("跨标准 → 不 fatal、必路由 human（机器不可判）", () => {
    const crossAxis = { ...L2ok, axis_std: "hs" as const, axis_code: "0101" };
    const v = validateFusionEdge(crossAxis, L1);
    expect(v.fatal).toHaveLength(0);
    expect(v.human.join()).toMatch(/跨标准挂载/);
  });
  it("大类归属漂移（子 group≠父 group）→ fatal", () => {
    const drift = { ...L2ok, group_code: "UGT-G-99" };
    expect(validateFusionEdge(drift, L1).fatal.join()).toMatch(/归属漂移/);
  });
});

describe("collectEdgeViolations / 辅助", () => {
  it("父未随行 → human（送审不误拒）", () => {
    const v = collectEdgeViolations([L2ok]); // 只给子，不给 L1
    expect(v.find((x) => x.code === "UGT-043115")!.human.join()).toMatch(/未随行/);
    expect(hasFatal(v)).toBe(false);
  });
  it("整棵合法树无 fatal", () => {
    const rows = [L1, L2ok, { ...L2ok, code: "UGT-043115007", parent_code: "UGT-043115", level: 3, axis_code: "100120" }];
    const viol = collectEdgeViolations(rows);
    expect(hasFatal(viol)).toBe(false);
  });
  it("expectedParentCode / groupL1Coverage", () => {
    expect(expectedParentCode("UGT-043115")).toBe("UGT-043");
    expect(expectedParentCode("UGT-043")).toBe("");
    expect(groupL1Coverage([L1, L2ok]).get("UGT-G-07")).toEqual(["UGT-043"]);
  });
});
