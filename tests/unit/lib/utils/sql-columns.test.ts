/**
 * columns() 单测：分隔符的单一出处必须自己站得住
 * 背景：相似公告因「列片段自带尾逗号」在生产上 1064 三周，单测 mock 了 pool.query 所以没发现。
 * 本测试钉住四条不变量，配套门禁 scripts/gates/check-sql-column-fragments.mjs 拦写法。
 */
import { describe, it, expect } from "vitest";
import { columns } from "@/lib/utils/sql-columns";

describe("columns() 列清单拼接", () => {
  it("相邻列之间恰有一个逗号，首尾无逗号", () => {
    expect(columns("n.id", "n.title")).toBe("n.id, n.title");
    expect(columns("n.id, n.title", "n.deadline")).toBe("n.id, n.title, n.deadline");
  });

  it("falsy 与纯空白片段被剔除（条件列不启用不留空位）", () => {
    expect(columns("n.id", undefined, "n.title", false, "   ", null)).toBe("n.id, n.title");
    // 线上事故形状：不传 locale 时条件列整段消失，末列仍不带逗号
    const locale = undefined;
    const sql = columns(
      "n.estimated_value",
      locale && "tr.title_tr AS title_i18n",
      "tre.title_tr AS title_en",
    );
    expect(sql).toBe("n.estimated_value, tre.title_tr AS title_en");
    expect(sql).not.toMatch(/,\s*$/);
    expect(`SELECT ${sql}\n FROM t`).not.toMatch(/,\s*\n?\s*FROM/i);
  });

  it("片段自带首/尾逗号直接抛错，不把坏 SQL 发给数据库", () => {
    expect(() => columns("tre.title_tr AS title_en,")).toThrow(/不得自带分隔符/);
    expect(() => columns(",tre.title_tr AS title_en")).toThrow(/不得自带分隔符/);
    // 抛错信息里必须能看见是哪一段，否则排查还要反查栈
    expect(() => columns("a", "b,")).toThrow(/b,/);
  });

  it("全空片段抛错：空 SELECT 不是合法 SQL，不允许静默产出", () => {
    expect(() => columns(undefined, false, "")).toThrow(/列清单不能为空/);
    expect(() => columns()).toThrow(/列清单不能为空/);
  });
});
