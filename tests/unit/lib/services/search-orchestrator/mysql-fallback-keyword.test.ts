import { describe, it, expect } from "vitest";
import { buildKeywordUnion } from "@/lib/services/search-orchestrator/mysql-fallback";

describe("buildKeywordUnion", () => {
  it("普通英文词：SQL 形状与现网一致（三路 FULLTEXT UNION）", () => {
    const { sql, params } = buildKeywordUnion("solar");
    expect(sql).toContain("MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)");
    expect(sql).toContain("MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)");
    expect(params).toEqual(["solar", "solar", "solar"]);
  });
  it("带排除词：BOOLEAN 分支吃 +/- 语法，译文分支补 NOT LIKE", () => {
    const { sql, params } = buildKeywordUnion("solar -battery");
    expect(sql).toContain("AGAINST(? IN BOOLEAN MODE)");
    expect(sql).toContain("NOT LIKE");
    // boolean 串 + 每个正/负 token 两次（title/description）
    expect(params[0]).toBe("+solar -battery");
    expect(params.filter((p) => p === "%battery%")).toHaveLength(2);
  });
  it("中文 + 排除词：译文分支按排除词 NOT LIKE", () => {
    const { params } = buildKeywordUnion("光伏 -电池");
    expect(params[0]).toBe("+光伏 -电池");
    expect(params).toContain("%电池%");
  });
  it("纯排除词：无正向 LIKE 分支", () => {
    const { sql, params } = buildKeywordUnion("-battery");
    expect(params[0]).toBe("-battery");
    expect(sql).not.toContain("LIKE");
    expect(params).toEqual(["-battery"]);
  });
});

/**
 * 降级路径与 Meili 主路径的 AND/OR 同源性（缺陷回归）。
 * 背景：修复前包含词之间在译文分支恒用 OR，且普通中文查询用整串 LIKE（实测恒 0 命中）、
 * FULLTEXT 不带操作符时 MySQL 布尔模式按“词可选”求值（OR）——导致
 * 「医疗 建筑」实测 52（实为 OR 结果，真 AND 只有 2），而加 -学校 后反涨到 670。
 */
describe("buildKeywordUnion 匹配模式同源性（matchMode）", () => {
  const POS_AND = "(title_tr LIKE ? OR description_tr LIKE ?) AND (title_tr LIKE ? OR description_tr LIKE ?)";
  const POS_OR = "(title_tr LIKE ? OR description_tr LIKE ?) OR (title_tr LIKE ? OR description_tr LIKE ?)";

  it("默认 all：不传第二参与显式 all 一致", () => {
    expect(buildKeywordUnion("医疗 建筑")).toEqual(buildKeywordUnion("医疗 建筑", "all"));
  });

  it("普通中文多词 all：FULLTEXT 加 + 前缀成硬 AND，译文逐词 AND（不再整串 LIKE）", () => {
    const { sql, params } = buildKeywordUnion("医疗 建筑");
    expect(params[0]).toBe("+医疗 +建筑");
    // 旧实现的整串兜底必须消失（它对多词中文恒 0 命中）
    expect(params).not.toContain("%医疗 建筑%");
    expect(sql).toContain("(qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?) AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)");
    expect(params).toEqual(["+医疗 +建筑", "%医疗%", "%医疗%", "%建筑%", "%建筑%"]);
  });

  it("普通中文多词 any：不加 +（保持可选=OR），译文用 OR 连接", () => {
    const { sql, params } = buildKeywordUnion("医疗 建筑", "any");
    expect(params[0]).toBe("医疗 建筑");
    expect(sql).toContain("(qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?) OR (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)");
  });

  it("普通中文单词 all：与多词同构且语义等价（单词无需 + 也等价）", () => {
    const { sql, params } = buildKeywordUnion("医疗");
    expect(params).toEqual(["+医疗", "%医疗%", "%医疗%"]);
    expect(sql).not.toContain(") AND (qzh.");
  });

  it("高级语法 all：包含词之间用 AND（修复前恒 OR，是把降级结果放大一个量级的主因）", () => {
    const { sql, params } = buildKeywordUnion("医疗 建筑 -学校");
    expect(params[0]).toBe("+医疗 +建筑 -学校");
    expect(sql).toContain(POS_AND);
    expect(sql).toContain("(title_tr NOT LIKE ? AND description_tr NOT LIKE ?)");
    expect(params).toEqual(["+医疗 +建筑 -学校", "%医疗%", "%医疗%", "%建筑%", "%建筑%", "%学校%", "%学校%"]);
  });

  it("高级语法 any：包含词不加 +，排除与短语仍保留", () => {
    const { params } = buildKeywordUnion("医疗 建筑 -学校", "any");
    expect(params[0]).toBe("医疗 建筑 -学校");
  });

  it("高级语法 any：译文包含词之间用 OR", () => {
    const { sql } = buildKeywordUnion("医疗 建筑 -学校", "any");
    expect(sql).toContain(POS_OR);
  });

  it("英文普通查询不受 matchMode 影响（形状逐字节保持）", () => {
    expect(buildKeywordUnion("solar pump", "any")).toEqual(buildKeywordUnion("solar pump", "all"));
  });
});
