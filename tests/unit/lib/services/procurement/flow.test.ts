/**
 * 授权签署 / 发布闸单测（mock 连接池）
 * @module tests/unit/lib/services/procurement/flow
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
// file-upload 拉起 server-only（pool 链），单测内 mock 掉上传落库
vi.mock("@/lib/services/file-upload", () => ({
  saveProcurementScan: vi.fn(async (p: { filename: string }) => ({
    url: `/api/procurement/authorization-files/${p.filename}`,
    filename: p.filename,
  })),
}));
import { signAuthorization } from "@/lib/services/procurement/authorization";
import { applyReviewDecision } from "@/lib/services/procurement/tender";
import { computeLetterHash } from "@/lib/services/procurement/authorization-letter";

const NOW = 1_777_593_600;
const PID = 7;

const LETTER_HASH = computeLetterHash({
  reference: "OSPR-2026-000007",
  versionNo: 2,
  buyerOrgName: "西安某新能源有限公司",
  projectTitle: "采购光伏组件 10MW",
});

interface Handlers {
  [sqlFragment: string]: (sql: string) => unknown;
}

function fakeDb(handlers: Handlers) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[]];
    }),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [{ affectedRows: 1, insertId: 55 }];
    }),
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[]];
    }),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [{ affectedRows: 1 }];
    }),
    getConnection: vi.fn().mockResolvedValue(conn),
  } as unknown as Pool;
  return { pool, conn, calls };
}

const PROJECT = {
  id: PID,
  reference: "OSPR-2026-000007",
  buyer_id: 1,
  version_no: 2,
  status: "submitted",
  title_zh: "采购光伏组件 10MW",
  title_en: null,
  background: "背景",
  budget_amount: "1200.00",
  budget_currency: "CNY",
  budget_public: 1,
  delivery_country: "肯尼亚",
  delivery_city: "内罗毕",
  delivery_province: null,
  delivery_address: null,
  quote_deadline_at: NOW + 86400,
  primary_ugt_code: "UGT-0301",
  notice_pk: null,
  contact_disclosure: "org_only",
};

describe("signAuthorization — 签署闸", () => {
  const scan = { buffer: Buffer.from("scan"), contentType: "image/png" };

  it("版本不匹配 → version_conflict（改稿后旧签署拒绝）", async () => {
    const { pool } = fakeDb({
      "SELECT * FROM procurement_projects": () => [[PROJECT]],
      "SELECT org_name FROM procurement_buyers": () => [[{ org_name: "西安某新能源有限公司" }]],
    });
    const r = await signAuthorization(pool, {
      projectId: PID, signerUid: 42, signerName: "张三", letterHash: LETTER_HASH, versionNo: 1, scan,
    });
    expect(r).toEqual({ ok: false, reason: "version_conflict" });
  });

  it("letterHash 与当前版本授权书不符 → letter_mismatch", async () => {
    const { pool } = fakeDb({
      "SELECT * FROM procurement_projects": () => [[PROJECT]],
      "SELECT org_name FROM procurement_buyers": () => [[{ org_name: "西安某新能源有限公司" }]],
    });
    const r = await signAuthorization(pool, {
      projectId: PID, signerUid: 42, signerName: "张三", letterHash: "0".repeat(64), versionNo: 2, scan,
    });
    expect(r).toEqual({ ok: false, reason: "letter_mismatch" });
  });

  it("合法签署 → pending 落库", async () => {
    const { pool, calls } = fakeDb({
      "SELECT * FROM procurement_projects": () => [[PROJECT]],
      "SELECT org_name FROM procurement_buyers": () => [[{ org_name: "西安某新能源有限公司" }]],
    });
    const r = await signAuthorization(pool, {
      projectId: PID, signerUid: 42, signerName: "张三", letterHash: LETTER_HASH, versionNo: 2, scan, at: NOW,
    });
    expect(r.ok).toBe(true);
    const insert = calls.find(([sql]) => sql.includes("INSERT INTO procurement_authorizations"));
    expect(insert).toBeDefined();
    expect(insert![1]).toContain(LETTER_HASH);
  });
});

describe("applyReviewDecision — 发布闸", () => {
  function baseHandlers(over: { auth?: string; buyer?: string; projectStatus?: string } = {}): Handlers {
    const project = { ...PROJECT, status: over.projectStatus ?? "submitted" };
    return {
      "SELECT * FROM procurement_projects": () => [[project]],
      "SELECT id, status, version_no, buyer_id FROM procurement_projects": () => [
        [{ id: PID, status: project.status, version_no: 2, buyer_id: 1 }],
      ],
      "SELECT status FROM procurement_authorizations": () => [[{ status: over.auth ?? "verified" }]],
      "SELECT status FROM procurement_buyers WHERE id": () => [[{ status: over.buyer ?? "verified" }]],
      "SELECT org_name, user_id FROM procurement_buyers": () => [[{ org_name: "西安某新能源有限公司", user_id: 42 }]],
      "FROM procurement_items WHERE project_id": () => [[{ name_zh: "组件", spec: "540W", quantity: "1000", qty_unit: "块" }]],
      "INSERT INTO bid_notices": () => [{ insertId: 9001 }],
      "INSERT INTO rfq_guard": () => [{ affectedRows: 1 }],
      "INSERT INTO procurement_tenders": () => [{ insertId: 3 }],
      "UPDATE procurement_tenders SET tender_no": () => [{ affectedRows: 1 }],
      "SELECT id FROM procurement_reviews WHERE project_id": () => [[]],
    };
  }

  it("授权未核验 → authorization_required（工单不消耗）", async () => {
    const { pool, conn } = fakeDb(baseHandlers({ auth: "pending" }));
    const r = await applyReviewDecision(pool, {
      projectId: PID, version: 2, decision: "approved", callbackId: "cb-1", at: NOW,
    });
    expect(r).toEqual({ ok: false, reason: "authorization_required" });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it("采购主体未认证 → buyer_not_verified（F01 发布前置）", async () => {
    const { pool } = fakeDb(baseHandlers({ buyer: "pending" }));
    const r = await applyReviewDecision(pool, {
      projectId: PID, version: 2, decision: "approved", callbackId: "cb-2", at: NOW,
    });
    expect(r).toEqual({ ok: false, reason: "buyer_not_verified" });
  });

  it("核验通过 → published + 投影 + 守护登记 + tender", async () => {
    const { pool, calls, conn } = fakeDb(baseHandlers());
    const r = await applyReviewDecision(pool, {
      projectId: PID, version: 2, decision: "approved", callbackId: "cb-3", reviewerRef: "RV-1", at: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("published");
    expect(r.tenderNo).toBe("OSPT-2026-000003");
    expect(calls.find(([sql]) => sql.includes("INSERT INTO bid_notices"))).toBeDefined();
    expect(calls.find(([sql]) => sql.includes("INSERT INTO rfq_guard"))).toBeDefined();
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it("退回理由不足 10 字 → reason_required", async () => {
    const { pool } = fakeDb(baseHandlers());
    const r = await applyReviewDecision(pool, {
      projectId: PID, version: 2, decision: "rejected", reason: "不行", callbackId: "cb-4", at: NOW,
    });
    expect(r).toEqual({ ok: false, reason: "reason_required" });
  });

  it("退回合规 → need_info（可补充后重提）", async () => {
    const { pool } = fakeDb(baseHandlers());
    const r = await applyReviewDecision(pool, {
      projectId: PID, version: 2, decision: "rejected",
      reason: "缺少技术规格与验收标准，请补充完整后再提交", callbackId: "cb-5", at: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("need_info");
  });
});
