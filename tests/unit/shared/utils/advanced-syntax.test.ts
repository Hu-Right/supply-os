import { describe, it, expect } from "vitest";
import {
  parseAdvancedQuery, hasAdvancedSyntax, stripAdvancedSyntax,
  toBooleanModeQuery, resolveAdvancedQuery, composeQ, parseQ,
} from "@/shared/utils/advanced-syntax";

describe("parseAdvancedQuery", () => {
  it("普通多词 → 全部为 includes，非高级语法", () => {
    const p = parseAdvancedQuery("solar panel");
    expect(p).toEqual({ includes: ["solar", "panel"], excludes: [], phrases: [] });
    expect(hasAdvancedSyntax("solar panel")).toBe(false);
  });
  it("-词 → excludes", () => {
    expect(parseAdvancedQuery("solar -battery")).toEqual({
      includes: ["solar"], excludes: ["battery"], phrases: [],
    });
  });
  it("\"短语\" → phrases", () => {
    expect(parseAdvancedQuery('"water supply" solar')).toEqual({
      includes: ["solar"], excludes: [], phrases: ["water supply"],
    });
  });
  it("中文排除与短语", () => {
    const p = parseAdvancedQuery("光伏 -电池 \"太阳能 板\"");
    expect(p.includes).toEqual(["光伏"]);
    expect(p.excludes).toEqual(["电池"]);
    expect(p.phrases).toEqual(["太阳能 板"]);
  });
  it("孤立 - 与空串忽略；未闭合引号剥引号后按普通词", () => {
    expect(parseAdvancedQuery("solar - \"water")).toEqual({
      includes: ["solar", "water"], excludes: [], phrases: [],
    });
  });
  it("空输入", () => {
    expect(parseAdvancedQuery("")).toEqual({ includes: [], excludes: [], phrases: [] });
  });
});

describe("stripAdvancedSyntax / toBooleanModeQuery", () => {
  it("strip 只留包含词，丢弃排除词与引号", () => {
    expect(stripAdvancedSyntax('solar -battery "water supply"')).toBe("solar water supply");
  });
  it("strip 全排除词 → 空串", () => {
    expect(stripAdvancedSyntax("-battery")).toBe("");
  });
  it("BOOLEAN MODE：+inc -exc \"短语\"，词内引号剥除", () => {
    expect(toBooleanModeQuery({ includes: ["so\"lar"], excludes: ["battery"], phrases: ["water supply"] }))
      .toBe('+solar -battery "water supply"');
  });
});

describe("resolveAdvancedQuery", () => {
  it("无高级语法 → 原样、不降级（含未登录）", () => {
    expect(resolveAdvancedQuery("solar panel", false)).toEqual({ q: "solar panel", degraded: false });
  });
  it("有语法无权益 → 剥离降级", () => {
    expect(resolveAdvancedQuery("solar -battery", false)).toEqual({ q: "solar", degraded: true });
  });
  it("有语法有权益 → 原样透传", () => {
    expect(resolveAdvancedQuery("solar -battery", true)).toEqual({ q: "solar -battery", degraded: false });
  });
});

describe("composeQ / parseQ（前端往返）", () => {
  it("空行过滤 + 模式合成", () => {
    expect(composeQ("solar", [
      { id: 1, term: "  ", mode: "include" },
      { id: 2, term: "battery", mode: "exclude" },
      { id: 3, term: "water supply", mode: "phrase" },
    ])).toBe('solar -battery "water supply"');
  });
  it("合成截断到 200 字符", () => {
    expect(composeQ("a".repeat(210), []).length).toBe(200);
  });
  it("parseQ：排除/短语成行，包含词回 plain", () => {
    const r = parseQ('solar -battery "water supply"');
    expect(r.plain).toBe("solar");
    expect(r.rows).toEqual([
      { id: 1, term: "battery", mode: "exclude" },
      { id: 2, term: "water supply", mode: "phrase" },
    ]);
  });
  it("往返：composeQ(parseQ(q)) 与原 q 语义等价", () => {
    const q = 'solar -battery "water supply"';
    const r = parseQ(q);
    expect(composeQ(r.plain, r.rows)).toBe(q);
  });
});
