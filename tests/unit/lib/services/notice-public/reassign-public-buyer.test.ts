/**
 * reassignPublicBuyer（2026-11-23 买家实体合并改挂）
 *
 * 不变量：
 * ① 服务表 buyer_id/buyer_name/buyer_name_cn 一次性改挂到留存实体，仍由 build.ts 唯一写入；
 * ② 留存实体缺中文名时传空串，SQL 侧 COALESCE 保留行上旧译名（不拿 NULL 清空有效数据）；
 * ③ 非法 id / 缺 canonical 名直接抛错，绝不落一条半成品 UPDATE；
 * ④ canonical / nameZh 按列宽（500）截断，避免 UPDATE 被 MySQL 严格模式拒绝。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { reassignPublicBuyer } from "@/lib/services/notice-public/build";

/** 最小 mysql2 query 替身：记录 SQL/参数并回 affectedRows。 */
function fakePool(affectedRows = 1) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return [{ affectedRows }, []];
  });
  return { pool: { query } as unknown as Pick<Pool, "query">, calls };
}

describe("reassignPublicBuyer", () => {
  it("把服务表行改挂到留存实体并重写 canonical 名", async () => {
    const { pool, calls } = fakePool(3);
    const affected = await reassignPublicBuyer(pool, {
      fromBuyerId: 11,
      toBuyerId: 22,
      canonicalName: "ACME S.A.",
      nameZh: "艾克米",
    });
    expect(affected).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/UPDATE notice_public/i);
    expect(calls[0].sql).not.toMatch(/\bJOIN\s+`?buyer`?\b/i); // B2：build.ts 不读 buyer 表
    expect(calls[0].params).toEqual([22, "ACME S.A.", "艾克米", 11]);
  });

  it("留存实体缺中文名 → 传空串，SQL 侧保留行上旧译名", async () => {
    const { pool, calls } = fakePool();
    await reassignPublicBuyer(pool, {
      fromBuyerId: 1,
      toBuyerId: 2,
      canonicalName: "ACME",
      nameZh: null,
    });
    expect(calls[0].sql).toMatch(/buyer_name_cn = COALESCE\(NULLIF\(\?, ''\), buyer_name_cn\)/i);
    expect(calls[0].params[2]).toBe("");
  });

  it("非法实体 id（相同 / 非正 / 非整数）直接拒绝", async () => {
    const { pool, calls } = fakePool();
    await expect(reassignPublicBuyer(pool, { fromBuyerId: 5, toBuyerId: 5, canonicalName: "A" }))
      .rejects.toThrow(/非法实体 id/);
    await expect(reassignPublicBuyer(pool, { fromBuyerId: 0, toBuyerId: 5, canonicalName: "A" }))
      .rejects.toThrow(/非法实体 id/);
    await expect(reassignPublicBuyer(pool, { fromBuyerId: 1.5, toBuyerId: 5, canonicalName: "A" }))
      .rejects.toThrow(/非法实体 id/);
    expect(calls).toHaveLength(0);
  });

  it("留存实体缺 canonical 名直接拒绝（不落半成品 UPDATE）", async () => {
    const { pool, calls } = fakePool();
    await expect(reassignPublicBuyer(pool, { fromBuyerId: 1, toBuyerId: 2, canonicalName: "  " }))
      .rejects.toThrow(/缺少 canonical 名/);
    expect(calls).toHaveLength(0);
  });

  it("canonical / nameZh 按列宽 500 截断", async () => {
    const { pool, calls } = fakePool();
    await reassignPublicBuyer(pool, {
      fromBuyerId: 1,
      toBuyerId: 2,
      canonicalName: "A".repeat(600),
      nameZh: "中".repeat(600),
    });
    expect((calls[0].params[1] as string)).toHaveLength(500);
    expect((calls[0].params[2] as string)).toHaveLength(500);
  });
});
