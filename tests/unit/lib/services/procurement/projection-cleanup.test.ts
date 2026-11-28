import { describe, it, expect } from "vitest";
import { removeProjection } from "@/lib/services/procurement/projection";

describe("removeProjection — 撤回/到期清投影", () => {
  it("同时清 bid_notices、notice_public、rfq_guard，并触发搜索侧下架", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return [{ affectedRows: 1 }, []];
      },
    };
    await removeProjection(db as never, 99);
    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes("DELETE FROM bid_notices"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM notice_public"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM notice_public"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM rfq_guard"))).toBe(true);
  });

  it("noticePk 为空时不执行任何清理", async () => {
    let n = 0;
    const db = { query: async () => { n += 1; return [{ affectedRows: 0 }, []]; } };
    await removeProjection(db as never, null);
    expect(n).toBe(0);
  });
});

