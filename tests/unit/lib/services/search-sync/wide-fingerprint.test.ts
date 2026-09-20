/**
 * 宽表源指纹表达式形状不变量（I1）
 *
 * 指纹只允许依赖「构建宽表时真正读过的输入」，且不得依赖宽表自身当前值 ——
 * 这是「修复后必然收敛」的前提。测试锁定的是这些依赖边界，而非 MD5 结果值。
 */
import { describe, it, expect } from "vitest";
import { WIDE_FP_EXPR, FP_SLICE_SIZE, FP_SLICES_PER_ROUND } from "@/lib/services/search-sync/wide-fingerprint";
import { DESC_SOURCE_EXPR, WIDE_LIMITS } from "@/lib/utils/notice-field-limits";

describe("WIDE_FP_EXPR", () => {
  it("覆盖宽表内容构建读过的全部主表字段", () => {
    for (const col of ["n.title", "n.reference", "n.notice_id", "n.country", "n.agency",
      "n.notice_type", "n.deadline_sec", "n.is_featured", "n.estimated_value",
      "n.published_date", "n.entry_source", "n.rfq_status"]) {
      expect(WIDE_FP_EXPR, col).toContain(col);
    }
  });

  it("描述来源复用 DESC_SOURCE_EXPR（机会表优先），与宽表同一口径", () => {
    expect(WIDE_FP_EXPR).toContain(DESC_SOURCE_EXPR);
  });

  it("机会表展示列与三张输入表聚合均在指纹内", () => {
    expect(WIDE_FP_EXPR).toContain("opp.description_cn");
    expect(WIDE_FP_EXPR).toContain("opp.bid_overview");
    expect(WIDE_FP_EXPR).toContain("opp.beneficiary_countries");
    expect(WIDE_FP_EXPR).toContain("crm_bid_notice_unspsc_codes");
    expect(WIDE_FP_EXPR).toContain("crm_notice_translations");
    expect(WIDE_FP_EXPR).toContain("crm_bid_opportunity_unspsc_candidates");
  });

  it("平台自填分类列在指纹内（分类变更须触发重建）", () => {
    expect(WIDE_FP_EXPR).toContain("n.category_l1_id");
    expect(WIDE_FP_EXPR).toContain("n.category_l2_id");
  });

  it("禁止 GROUP_CONCAT（默认 1024 字节截断会漏检变更）", () => {
    expect(WIDE_FP_EXPR).not.toMatch(/GROUP_CONCAT/i);
  });

  it("不引用宽表列（否则指纹随修复结果自反馈，永不收敛）", () => {
    expect(WIDE_FP_EXPR).not.toMatch(/crm_notice_search|ns\./);
  });

  it("长度全部来自 WIDE_LIMITS 常量", () => {
    expect(WIDE_FP_EXPR).toContain(String(WIDE_LIMITS.title));
    expect(WIDE_FP_EXPR).toContain(String(WIDE_LIMITS.description));
  });

  it("以 MD5 包裹且为单表达式（可直接拼进 SELECT 列表）", () => {
    expect(WIDE_FP_EXPR.startsWith("MD5(")).toBe(true);
    expect(WIDE_FP_EXPR).not.toContain(";");
  });

  it("括号配平（不配平只在连库时才爆，此处提前拦截）", () => {
    let depth = 0;
    let min = 0;
    for (const c of WIDE_FP_EXPR) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      if (depth < min) min = depth;
    }
    expect(min, "出现多余右括号").toBe(0);
    expect(depth, "括号未配平").toBe(0);
  });

  it("切片参数为正整数（对账轮转成本上限）", () => {
    expect(FP_SLICE_SIZE).toBeGreaterThan(0);
    expect(FP_SLICES_PER_ROUND).toBeGreaterThan(0);
  });
});
