/**
 * RFQ 提交审核单测（mock 连接池）
 * @module tests/unit/lib/services/rfq/submit
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { submitDemand } from "@/lib/services/rfq/submit";
import { DEMAND_STATUS, REVIEW_SLA_HOURS } from "@/shared/constants/rfq-demand";

const NOW = 1_777_593_600;
const DEMAND_ID = 7;
const BUYER = 42;

function demandRow(over: Record<string, unknown> = {}) {
  return {
    id: DEMAND_ID,
    buyer_user_id: BUYER,
    status: DEMAND_STATUS.DRAFT,
    revision_no: 0,
    title: "采购光伏组件 10MW",
    description: "用于西北地区分布式电站，需满足双面双玻与 25 年功率质保，含运输与卸货，验收按 GB/T 9535 执行。",
    category_code: "UGT-0301",
    province_name: "陕西省",
    quantity: "10.000",
    quantity_unit: "MW",
    purchase_type: "once",
    budget_amount: "1200.00",
    budget_currency: "CNY",
    budget_confidential: 0,
    incoterm: "FOB",
    delivery_time: "合同签订后 60 天",
    delivery_address: "西安市高新区",
    payment_terms: "T/T 电汇",
    supplier_reqs: "有出口经验",
    visibility: "public",
    contact_name: "张三",
    contact_email: "buyer@example.com",
    contact_phone: "13800000000",
    terms_version: "v1",
    agreed_at: NOW - 60,
    close_at: NOW + 10 * 86400,
    open_at: null,
    notice_pk: null,
    ...over,
  };
}

function fakePool(row: Record<string, unknown> | null) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      calls.push([s, params]);
      if (s.startsWith("SELECT * FROM rfq_demand")) return [row ? [row] : []];
      if (s.startsWith("SELECT id, status, revision_no FROM rfq_demand")) {
        return [[{ id: DEMAND_ID, status: row?.status ?? "draft", revision_no: (row?.revision_no as number ?? 0) + 1 }]];
      }
      if (s.startsWith("INSERT INTO rfq_demand_revision")) return [{ affectedRows: 1, insertId: 1 }];
      return [{ affectedRows: 1 }];
    }),
  };
  const pool = { getConnection: vi.fn().mockResolvedValue(conn) };
  return { pool: pool as unknown as Pool, conn, calls };
}

function findCall(calls: Array<[string, unknown[] | undefined]>, needle: string) {
  return calls.find(([sql]) => sql.includes(needle));
}

describe("submitDemand", () => {
  it("需求不存在 → not_found", async () => {
    const { pool, conn } = fakePool(null);
    const res = await submitDemand(pool, { demandId: DEMAND_ID, buyerUserId: BUYER, at: NOW });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });

  it("非本人 → forbidden", async () => {
    const { pool } = fakePool(demandRow({ buyer_user_id: 999 }));
    const res = await submitDemand(pool, { demandId: DEMAND_ID, buyerUserId: BUYER, at: NOW });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
  });

  it("已在审核中 → 幂等返回，不生成第二份工单", async () => {
    const { pool, calls } = fakePool(demandRow({ status: DEMAND_STATUS.SUBMITTED, revision_no: 2 }));
    const res = await submitDemand(pool, { demandId: DEMAND_ID, buyerUserId: BUYER, at: NOW });
    expect(res).toEqual({ ok: true, status: DEMAND_STATUS.SUBMITTED, version: 2, already: true });
    expect(findCall(calls, "INSERT INTO rfq_review_task")).toBeUndefined();
  });

  it("已发布 → not_editable", async () => {
    const { pool } = fakePool(demandRow({ status: DEMAND_STATUS.PUBLISHED, revision_no: 3 }));
    const res = await submitDemand(pool, { demandId: DEMAND_ID, buyerUserId: BUYER, at: NOW });
    expect(res).toEqual({ ok: false, reason: "not_editable" });
  });

  it("校验不通过 → invalid 并逐字段返回错误，不写版本", async () => {
    const { pool, calls, conn } = fakePool(demandRow({ title: "短标题" }));
    const res = await submitDemand(pool, { demandId: DEMAND_ID, buyerUserId: BUYER, at: NOW });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("invalid");
      expect(res.errors?.map((e) => e.field)).toContain("title");
    }
    expect(findCall(calls, "INSERT INTO rfq_demand_revision")).toBeUndefined();
    expect(conn.rollback).toHaveBeenCalledOnce();
  });

  it("成功：冻结版本 + 作废旧工单 + 新工单 + 状态转 submitted", async () => {
    const { pool, calls, conn } = fakePool(demandRow());
    const res = await submitDemand(pool, { demandId: DEMAND_ID, buyerUserId: BUYER, at: NOW });

    expect(res).toEqual({ ok: true, status: DEMAND_STATUS.SUBMITTED, version: 1 });
    expect(conn.commit).toHaveBeenCalledOnce();

    const revision = findCall(calls, "INSERT INTO rfq_demand_revision");
    expect(revision).toBeDefined();
    const [revSql, revParams] = revision!;
    expect(revSql).toContain("content_hash");
    expect(revParams?.[0]).toBe(DEMAND_ID);
    expect(revParams?.[1]).toBe(1);
    // 快照里必须有审核需要的内容，且不含内部字段
    const snapshot = JSON.parse(String(revParams?.[2]));
    expect(snapshot.title).toBe("采购光伏组件 10MW");
    expect(snapshot).not.toHaveProperty("notice_pk");
    expect(String(revParams?.[3])).toMatch(/^[a-f0-9]{64}$/);

    const obsolete = findCall(calls, "status = 'obsolete'");
    expect(obsolete).toBeDefined();

    const task = findCall(calls, "INSERT INTO rfq_review_task");
    expect(task).toBeDefined();
    expect(task![1]).toEqual([DEMAND_ID, 1, NOW + REVIEW_SLA_HOURS * 3600, NOW]);

    const transition = calls.find(([sql]) => sql.includes("UPDATE rfq_demand SET status = ?"));
    expect(transition).toBeDefined();
    expect(transition![1]).toContain(DEMAND_STATUS.SUBMITTED);

    expect(findCall(calls, "INSERT INTO rfq_demand_event")).toBeDefined();
  });
});
