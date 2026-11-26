/**
 * 国别页聚合摘要 — 锁住「在挂量/截止压力/类型/采购方」的口径与服务端不重复查询。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { getCountrySummary, resetCountrySummaryCacheForTests } from "@/lib/services/seo/country-summary";

const makePool = (totals: unknown[], types: unknown[], buyers: unknown[]) => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([totals, []])
    .mockResolvedValueOnce([types, []])
    .mockResolvedValueOnce([buyers, []]);
  return { pool: { query } as unknown as Pool, query };
};

beforeEach(() => resetCountrySummaryCacheForTests());

describe("getCountrySummary", () => {
  it("聚合在挂量、7/30 天截止、类型与主要采购方", async () => {
    const { pool } = makePool(
      [{ active: 4793, d7: 1112, d30: 2904 }],
      [{ notice_type_code: "ITB", n: 4761 }],
      [{ buyer_name: "Bundesagentur für Arbeit", n: 84 }],
    );

    const summary = await getCountrySummary(pool, "de");

    expect(summary).toMatchObject({
      code: "DE",
      nameZh: "德国",
      active: 4793,
      deadline7: 1112,
      deadline30: 2904,
    });
    expect(summary?.types).toEqual([{ code: "ITB", label: expect.any(String), count: 4761 }]);
    expect(summary?.buyers).toEqual([{ name: "Bundesagentur für Arbeit", count: 84 }]);
  });

  it("空字符串/非法国家码直接返回 null，不查库", async () => {
    const { pool, query } = makePool([], [], []);
    expect(await getCountrySummary(pool, "X")).toBeNull();
    expect(await getCountrySummary(pool, "")).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("未知国家（解析不出名称）返回 null", async () => {
    const { pool } = makePool([], [], []);
    expect(await getCountrySummary(pool, "ZZ")).toBeNull();
  });

  it("10 分钟内二次调用走缓存，不重复查库", async () => {
    const { pool, query } = makePool(
      [{ active: 10, d7: 1, d30: 2 }],
      [{ notice_type_code: "RFQ", n: 10 }],
      [{ buyer_name: "某机构", n: 3 }],
    );

    await getCountrySummary(pool, "DE");
    await getCountrySummary(pool, "DE");

    expect(query).toHaveBeenCalledTimes(3);
  });
});
