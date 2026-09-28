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

describe("composeQ include 规范化（词组库/手动行统一口径）", () => {
  it("含空格的 include 词 → 整词短语", () => {
    expect(composeQ("", [{ id: 1, term: "solar panel", mode: "include" }])).toBe('"solar panel"');
  });
  it("前导 - 的 include 单词 → 剥离为普通词（不泄漏成排除）", () => {
    expect(composeQ("", [{ id: 1, term: "-battery", mode: "include" }])).toBe("battery");
  });
  it("内部引号的 include 词 → 去引号", () => {
    expect(composeQ("", [{ id: 1, term: 'a"b', mode: "include" }])).toBe("ab");
  });
  it("纯引号/空白词 → 跳过", () => {
    expect(composeQ("", [{ id: 1, term: '"', mode: "include" }])).toBe("");
    expect(composeQ("", [{ id: 1, term: "   ", mode: "include" }])).toBe("");
  });
  it("词组多词与手动多行 include 产出一致", () => {
    const rows = [
      { id: 1, term: "光伏", mode: "include" as const },
      { id: 2, term: "solar panel", mode: "include" as const },
    ];
    expect(composeQ("", rows)).toBe('光伏 "solar panel"');
  });
  it("回归：exclude/phrase 行与 qInput 自由文本行为不变", () => {
    expect(composeQ("", [{ id: 1, term: "battery", mode: "exclude" }])).toBe("-battery");
    expect(composeQ("", [{ id: 1, term: "water supply", mode: "phrase" }])).toBe('"water supply"');
    expect(composeQ("solar -battery", [])).toBe("solar -battery");
  });
});

/**
 * 用户直觉写的 `+词`（MySQL 布尔风格）必须归一为普通包含词：
 * 不剥会漏进词面，降级时拼成 `++词` 破坏布尔查询，且译文 LIKE 会去找字面 + 号恒不命中。
 */
describe("前导 + 归一（+词 ≡ 默认包含）", () => {
  it("parseAdvancedQuery：+前缀剥除，不进 excludes/phrases", () => {
    expect(parseAdvancedQuery("+医疗 +建筑 -学校")).toEqual({
      includes: ["医疗", "建筑"],
      excludes: ["学校"],
      phrases: [],
    });
  });
  it("toBooleanModeQuery：不再出现 ++ 疩形串", () => {
    expect(toBooleanModeQuery(parseAdvancedQuery("+医疗 +建筑 -学校"))).toBe("+医疗 +建筑 -学校");
  });
  it("与不带 + 的写法语义等价", () => {
    expect(toBooleanModeQuery(parseAdvancedQuery("+医疗 +建筑 -学校")))
      .toBe(toBooleanModeQuery(parseAdvancedQuery("医疗 建筑 -学校")));
  });
  it("孤立 + 被忽略；内部 + 保留（只剥前导）", () => {
    expect(parseAdvancedQuery("+ -医疗").includes).toEqual([]);
    expect(parseAdvancedQuery("a+b").includes).toEqual(["a+b"]);
  });
  it("composeQ：include 行的前导 + 一并剥除", () => {
    expect(composeQ("", [{ id: 1, term: "+医疗", mode: "include" }])).toBe("医疗");
  });
});
