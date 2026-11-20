/**
 * RFQ 响应服务单测：回执哈希、截止拦截、密封列表
 * @module tests/unit/lib/services/procurement/responses
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  computeReceiptHash,
  formatReceiptNo,
  listResponsesForBuyer,
  submitResponse,
  compareResponses,
} from "@/lib/services/procurement/responses";

const NOW = 1_777_593_600;

interface Handlers {
  [sqlFragment: string]: (sql: string) => unknown;
}

function fakeDb(handlers: Handlers) {
  const query = vi.fn(async (sql: string) => {
    for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
    return [[]];
  });
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query,
    execute: query,
  };
  const pool = { query, execute: query, getConnection: vi.fn().mockResolvedValue(conn) } as unknown as Pool;
  return { pool, conn };
}

const RESPONSE = {
  id: 11,
  project_id: 7,
  version_no: 1,
  tender_id: 3,
  supplier_id: 9,
  user_id: 5,
  method: "rfq",
  status: "draft",
  currency: "CNY",
  incoterm: null,
  incoterm_place: null,
  validity_days: null,
  lead_time_days: null,
  tax_included: 0,
  remark: null,
  receipt_no: null,
  receipt_hash: null,
  sealed_until: NOW + 3600,
  submitted_ts: null,
  withdrawn_ts: null,
  created_ts: NOW - 60,
  updated_ts: NOW - 60,
};

const TENDER = {
  id: 3,
  project_id: 7,
  version_no: 1,
  tender_no: "OSPT-2026-000003",
  publish_mode: "public",
  sealed: 1,
  award_method: "lowest_price",
  status: "published",
  published_at: NOW - 600,
  deadline_at: NOW + 3600,
  opened_ts: null,
};

describe("回执哈希与编号", () => {
  const base = {
    projectId: 7,
    versionNo: 1,
    tenderId: 3,
    supplierId: 9,
    submittedAt: NOW,
    files: [{ file_hash: "a" }, { file_hash: "b" }],
  };
  const items = [
    { item_id: 21, lot_id: null, seq: 1, unit_price: "12.5000", quantity: "10.0000", lead_time_days: 15 },
    { item_id: 20, lot_id: null, seq: 0, unit_price: "8.0000", quantity: "5.0000", lead_time_days: 7 },
  ];

  it("明细顺序不影响哈希", () => {
    const a = computeReceiptHash({ ...base, items });
    const b = computeReceiptHash({ ...base, items: [...items].reverse() });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("价格变化会改变哈希", () => {
    const a = computeReceiptHash({ ...base, items });
    const b = computeReceiptHash({
      ...base,
      items: [{ ...items[0], unit_price: "13.0000" }, items[1]],
    });
    expect(a).not.toBe(b);
  });

  it("回执编号按年 + 6 位补零", () => {
    expect(formatReceiptNo(11, NOW)).toMatch(/^OSRP-\d{4}-000011$/);
  });
});

describe("提交拦截", () => {
  it("已过截止 → closed，且不改库", async () => {
    const { pool, conn } = fakeDb({
      "SELECT * FROM procurement_responses": () => [[RESPONSE]],
      "FROM procurement_tenders": () => [[{ ...TENDER, deadline_at: NOW - 1 }]],
    });

    const result = await submitResponse(pool, { responseId: 11, userId: 5, at: NOW });

    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE procurement_responses"), expect.anything());
  });

  it("没有含单价的明细 → no_items", async () => {
    const { pool } = fakeDb({
      "SELECT * FROM procurement_responses": () => [[RESPONSE]],
      "FROM procurement_tenders": () => [[TENDER]],
      "FROM procurement_response_items": () => [
        [{ id: 1, response_id: 11, item_id: 20, lot_id: null, seq: 0, unit_price: null, quantity: "1", uom: null, lead_time_days: null, moq: null, brand_model: null, compliance: null, remark: null }],
      ],
      "FROM procurement_response_files": () => [[]],
    });

    const result = await submitResponse(pool, { responseId: 11, userId: 5, at: NOW });

    expect(result).toEqual({ ok: false, reason: "no_items" });
  });
});

describe("采购方视角的密封", () => {
  const ownership = () => [[{ id: 7, version_no: 1 }]];

  it("未开标只回份数，不回供应商与金额", async () => {
    const { pool } = fakeDb({
      "FROM procurement_projects p": ownership,
      "FROM procurement_tenders": () => [[TENDER]],
      "SELECT COUNT(*) AS c FROM procurement_responses": () => [[{ c: 3 }]],
    });

    const result = await listResponsesForBuyer(pool, { projectId: 7, buyerUserId: 1, at: NOW });

    expect(result).toEqual({ ok: true, opened: false, count: 3, items: [] });
  });

  it("开标后回明细摘要", async () => {
    const { pool } = fakeDb({
      "FROM procurement_projects p": ownership,
      "FROM procurement_tenders": () => [[{ ...TENDER, status: "closed", opened_ts: NOW }]],
      "JOIN supplier s ON s.id = r.supplier_id": () => [
        [
          { id: 11, supplier_id: 9, status: "submitted", currency: "CNY", submitted_ts: NOW - 30, company: "示例供应商", total: 125 },
        ],
      ],
    });

    const result = await listResponsesForBuyer(pool, { projectId: 7, buyerUserId: 1, at: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opened).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ supplierId: 9, company: "示例供应商", total: "125.00" });
  });

  it("未开标时比价直接拒绝", async () => {
    const { pool } = fakeDb({
      "FROM procurement_projects p": ownership,
      "FROM procurement_tenders": () => [[TENDER]],
      "SELECT COUNT(*) AS c FROM procurement_responses": () => [[{ c: 1 }]],
    });

    const result = await compareResponses(pool, { projectId: 7, buyerUserId: 1 });

    expect(result).toEqual({ ok: false, reason: "tender_not_open" });
  });
});