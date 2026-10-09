/**
 * 行业码制工具测试 — 门户消费行业面的地基假设
 * @module tests/unit/lib/services/industry-code.test.ts
 * @description 门户的「祖先路径」与「子树筛选」都建立在码长即层级之上
 *              （check:taxonomy 的 I3/I4 把这条钉成不变量）。本测试把推导结果固定下来：
 *              一旦哪天码制改了（补位、换前缀、允许跳级），这里先红，
 *              而不是让 /api/suppliers?industry_code= 静默返回错子集。
 */
import { describe, it, expect } from "vitest";
import {
  isIndustryCode,
  industryLevelOf,
  industryAncestorCodes,
  industrySubtreeLike,
  minimalSubtreePrefixes,
  sanitizeIndustryCode,
} from "@/lib/services/industry-code";

describe("isIndustryCode / sanitizeIndustryCode — 外部输入先验", () => {
  it("2/4/6/8 位偶数数字都是合法行业码", () => {
    for (const c of ["UGT-I-03", "UGT-I-0326", "UGT-I-032607", "UGT-I-03260701"]) {
      expect(isIndustryCode(c)).toBe(true);
      expect(sanitizeIndustryCode(c)).toBe(c);
    }
  });

  it("品目面码、奇数位、超长、非数字、注入串一律判非法（清洗为空串）", () => {
    for (const bad of [
      "UGT-C-03260701", // 另一张面的码，绝不能当行业码用
      "UGT-I-0", // 奇数位
      "UGT-I-0326070199", // 超过 8 位
      "UGT-I-AB",
      "A", // 国标原码不是我们的码
      "UGT-I-03' OR 1=1--",
      "",
      null,
      undefined,
    ]) {
      expect(isIndustryCode(bad)).toBe(false);
      expect(sanitizeIndustryCode(bad as string)).toBe("");
    }
  });

  it("前后空白先裁再判（下拉传回的码可能带空格）", () => {
    expect(sanitizeIndustryCode("  UGT-I-0326  ")).toBe("UGT-I-0326");
  });
});

describe("industryAncestorCodes — 路径推导", () => {
  it("小类码给出 门类/大类/中类/自身 四级，且首项是门类、末项是自身", () => {
    expect(industryAncestorCodes("UGT-I-03260701")).toEqual([
      "UGT-I-03",
      "UGT-I-0326",
      "UGT-I-032607",
      "UGT-I-03260701",
    ]);
  });

  it("门类码只有自己一项（不产生空祖先、不越界）", () => {
    expect(industryAncestorCodes("UGT-I-03")).toEqual(["UGT-I-03"]);
  });

  it("非法码返回空数组，不抛异常", () => {
    expect(industryAncestorCodes("UGT-C-03260701")).toEqual([]);
  });
});

describe("industryLevelOf / industrySubtreeLike", () => {
  it("2/4/6 位可由码长判定层级", () => {
    expect(industryLevelOf("UGT-I-03")).toBe("section");
    expect(industryLevelOf("UGT-I-0326")).toBe("division");
    expect(industryLevelOf("UGT-I-032607")).toBe("group");
  });

  it("8 位不猜层级：小类与自研延伸层同码长，必须回表读 level", () => {
    expect(industryLevelOf("UGT-I-03260701")).toBeNull();
  });

  it("子树前缀就是码本身加通配符（选中大类要含其下中类与小类）", () => {
    expect(industrySubtreeLike("UGT-I-0326")).toBe("UGT-I-0326%");
  });
});

describe("minimalSubtreePrefixes — 关键词命中节点去重", () => {
  it("祖先已入选时丢掉子孙码（一个词命中整棵子树，只拼一条 LIKE）", () => {
    expect(
      minimalSubtreePrefixes(["UGT-I-03260701", "UGT-I-0326", "UGT-I-03", "UGT-I-0326"]),
    ).toEqual(["UGT-I-03"]);
  });

  it("入参顺序无关，不同分支各自保留（03 与 33 互不包含）", () => {
    expect(minimalSubtreePrefixes(["UGT-I-3317", "UGT-I-03", "UGT-I-33"])).toEqual([
      "UGT-I-03",
      "UGT-I-33",
    ]);
  });

  it("非法码先丢再算，不把注入串当码前缀", () => {
    expect(minimalSubtreePrefixes(["UGT-I-03' OR 1=1--", "UGT-C-0326", "", "UGT-I-05"])).toEqual([
      "UGT-I-05",
    ]);
  });

  it("截断时保留高层码（宁可少几个分支，也不能让条件数把索引吃成全表扫）", () => {
    const broad = ["UGT-I-03", "UGT-I-05", "UGT-I-06", "UGT-I-07", "UGT-I-10"];
    const deep = broad.flatMap((s) => [`${s}11`, `${s}1122`]);
    // 高层码先入选并已覆盖子孙，max 截断只会砍掉更细的分支，不会砍掉广度
    expect(minimalSubtreePrefixes([...deep, ...broad], 3)).toEqual(["UGT-I-03", "UGT-I-05", "UGT-I-06"]);
  });

  it("空集合法：树里没命中就是没命中，上层不得拿它当退回文本口径的信号", () => {
    expect(minimalSubtreePrefixes([])).toEqual([]);
  });
});
