/**
 * 目标市场字典仓储 — 只读、按 sort_order、空表返回空数组。
 */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { MarketScopeRepo } from "@/lib/repos/market-scope.repo";

const poolWith = (rows: unknown[]) => {
  const query = vi.fn().mockResolvedValue([rows, []]);
  return { pool: { query } as unknown as Pool, query };
};

describe("MarketScopeRepo", () => {
  it("返回 active 市场并按 sort_order 映射字段", async () => {
    const { pool, query } = poolWith([
      { code: "EU", label_zh: "欧盟", label_en: "European Union", sort_order: 10 },
      { code: "DE", label_zh: "德国", label_en: "Germany", sort_order: 170 },
    ]);
    const rows = await new MarketScopeRepo(pool).listActive();
    expect(rows).toEqual([
      { code: "EU", labelZh: "欧盟", labelEn: "European Union", sortOrder: 10 },
      { code: "DE", labelZh: "德国", labelEn: "Germany", sortOrder: 170 },
    ]);
    expect(String(query.mock.calls[0][0])).toContain("is_active = 1");
    expect(String(query.mock.calls[0][0])).toContain("ORDER BY sort_order");
  });

  it("表为空时返回空数组（调用方回退常量）", async () => {
    const { pool } = poolWith([]);
    await expect(new MarketScopeRepo(pool).listActive()).resolves.toEqual([]);
  });
});
