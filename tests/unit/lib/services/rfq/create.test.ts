/**
 * RFQ 建草稿单测（mock 连接池）
 * @module tests/unit/lib/services/rfq/create
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { createDemandDraft, type CreateDemandInput } from "@/lib/services/rfq/create";

const NOW = 1_777_593_600; // 2026-05-01T00:00:00Z

function fakePool(over: { insertId?: number; failReference?: boolean } = {}) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      calls.push([s, params]);
      if (s.startsWith("INSERT INTO rfq_demand ")) {
        return [{ affectedRows: 1, insertId: over.insertId ?? 7 }];
      }
      if (s.startsWith("UPDATE rfq_demand SET reference")) {
        if (over.failReference) throw new Error("boom");
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    }),
  };
  const pool = { getConnection: vi.fn().mockResolvedValue(conn) };
  return { pool: pool as unknown as Pool, conn, calls };
}

function input(over: Partial<CreateDemandInput> = {}): CreateDemandInput {
  return {
    buyerUserId: 42,
    buyerOrgName: "西安某新能源有限公司",
    title: "采购光伏组件 10MW",
    description: "需求描述",
    categoryCode: "UGT-0301",
    provinceName: "陕西省",
    budgetAmount: 1200,
    budgetCurrency: "CNY",
    budgetConfidential: false,
    contactName: "张三",
    contactEmail: "buyer@example.com",
    closeAt: NOW + 10 * 86400,
    at: NOW,
    ...over,
  };
}

describe("createDemandDraft", () => {
  it("标题为空 → invalid_title，不写库", async () => {
    const { pool, calls } = fakePool();
    const res = await createDemandDraft(pool, input({ title: "   " }));
    expect(res).toEqual({ ok: false, reason: "invalid_title" });
    expect(calls).toHaveLength(0);
  });

  it("成功：建草稿 → 回填可读编号 → 写 created 事件，同事务提交", async () => {
    const { pool, conn, calls } = fakePool({ insertId: 7 });
    const res = await createDemandDraft(pool, input());

    expect(res).toEqual({ ok: true, id: 7, reference: "OSRFQ-2026-000007" });
    expect(conn.commit).toHaveBeenCalledOnce();

    const insert = calls.find(([sql]) => sql.startsWith("INSERT INTO rfq_demand "))!;
    // 建单先用临时唯一编号占位（reference 是 NOT NULL UNIQUE）
    expect(String(insert[1]?.[0])).toMatch(/^PENDING-/);
    // status=draft、revision=0 必须由服务端决定，不接受调用方传入
    const cols = String(insert[0]).match(/\(([^)]+)\)/)?.[1] ?? "";
    expect(cols).toContain("status");
    expect(insert[1]?.[3]).toBe("draft");
    expect(insert[1]?.[4]).toBe(0);

    const update = calls.find(([sql]) => sql.startsWith("UPDATE rfq_demand SET reference"))!;
    expect(update[1]).toEqual(["OSRFQ-2026-000007", 7]);

    const event = calls.find(([sql]) => sql.includes("INSERT INTO rfq_demand_event"))!;
    expect(event[1]?.[1]).toBe("created");
    expect(event[1]?.[2]).toBe("buyer");
  });

  it("回填编号失败 → 整体回滚（不留下无编号草稿）", async () => {
    const { pool, conn } = fakePool({ failReference: true });
    await expect(createDemandDraft(pool, input())).rejects.toThrow("boom");
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("int 溢出/自增缺失 → 抛错而不是写出一条无 id 记录", async () => {
    const { pool } = fakePool({ insertId: 0 });
    await expect(createDemandDraft(pool, input())).rejects.toThrow(/no id/);
  });
});
