/**
 * 合格机会谓词（I2 单一口径出口）
 *
 * 该函数被宽表 JOIN、SEO 详情子查询、精选 EXISTS 与搜索降级查询共用，
 * 无别名形态用于单表查询 —— 两个分支都必须是同一套三条件。
 */
import { describe, it, expect } from "vitest";
import { qualifiedOppWhere } from "@/lib/utils/notice-qualified";

describe("qualifiedOppWhere", () => {
  it("带别名时三列全部加前缀", () => {
    expect(qualifiedOppWhere("o1")).toBe(
      "(o1.is_qualified = 1 OR o1.status = 1 OR o1.audit_status = 1)",
    );
  });

  it("无别名（单表查询）不加前缀", () => {
    expect(qualifiedOppWhere()).toBe(
      "(is_qualified = 1 OR status = 1 OR audit_status = 1)",
    );
  });

  it("返回值自带括号，可安全与 AND/OR 拼接", () => {
    for (const alias of ["", "opp"]) {
      const sql = qualifiedOppWhere(alias);
      expect(sql.startsWith("(") && sql.endsWith(")")).toBe(true);
    }
  });
});
