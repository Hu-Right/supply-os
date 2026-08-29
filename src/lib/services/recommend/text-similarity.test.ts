import { describe, it, expect } from "vitest";
import { tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS } from "./text-similarity";

describe("tokenizeNoticeText", () => {
  it("英文文本 → 去停用词 + 长度≥3 的词元集合", () => {
    const tokens = tokenizeNoticeText("Construction of School Buildings");
    expect(tokens.has("construction")).toBe(true);
    expect(tokens.has("school")).toBe(true);
    expect(tokens.has("buildings")).toBe(true);
    // 停用词 "of" 不进入
    expect(tokens.has("of")).toBe(false);
  });

  it("中文文本 → bigram 拆词", () => {
    const tokens = tokenizeNoticeText("学校建设项目");
    // "学校建设项目" → 双字 bigram: "学校", "校建", "建设", "设项", "项目"
    expect(tokens.has("学校")).toBe(true);
    expect(tokens.has("建设")).toBe(true);
    expect(tokens.has("项目")).toBe(true);
  });

  it("空文本 → 空集合", () => {
    expect(tokenizeNoticeText("").size).toBe(0);
    expect(tokenizeNoticeText("").size).toBe(0);
  });

  it("短词（<3 字符）不进集合", () => {
    const tokens = tokenizeNoticeText("a an the of");
    expect(tokens.size).toBe(0);
  });

  it("采购领域停用词被过滤", () => {
    const tokens = tokenizeNoticeText("supply services tender bid rfq");
    expect(tokens.has("supply")).toBe(false);
    expect(tokens.has("services")).toBe(false);
    expect(tokens.has("tender")).toBe(false);
  });
});

describe("jaccardTokenSim", () => {
  it("完全相同集合 → 1.0", () => {
    const a = new Set(["x", "y", "z"]);
    expect(jaccardTokenSim(a, a)).toBe(1);
  });

  it("完全不交 → 0", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardTokenSim(a, b)).toBe(0);
  });

  it("部分交集 → 0~1", () => {
    const a = new Set(["x", "y", "z"]);
    const b = new Set(["y", "z", "w"]);
    const sim = jaccardTokenSim(a, b);
    // |A∩B|=2, |A∪B|=4 → 0.5
    expect(sim).toBeCloseTo(0.5);
  });

  it("空集合 → 0", () => {
    expect(jaccardTokenSim(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccardTokenSim(new Set(["a"]), new Set())).toBe(0);
  });

  it("对称性: jaccard(a,b) === jaccard(b,a)", () => {
    const a = new Set(["x", "y"]);
    const b = new Set(["y", "z"]);
    expect(jaccardTokenSim(a, b)).toBe(jaccardTokenSim(b, a));
  });
});

describe("S_TEXT_BONUS", () => {
  it("常量 = 0.05", () => {
    expect(S_TEXT_BONUS).toBe(0.05);
  });
});
