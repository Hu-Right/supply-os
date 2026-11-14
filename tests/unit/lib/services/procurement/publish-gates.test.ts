/**
 * 发布闸（四道）+ 回调幂等 + 分级授权裁剪 —— 回归单测
 *
 * @module tests/unit/lib/services/procurement/publish-gates
 * @description 覆盖 2026-11 审计后补的三件事：
 *              ① 发布前置：授权书 / 主体 / **授权发布勾选** / **报价截止时间** / **自动初审否决**；
 *              ② 回调幂等：以 `procurement_reviews.callback_id` 唯一键为事实（不再用 JSON LIKE），
 *                 同键重复投递回放首次结论；
 *              ③ 公开详情按 `contact_disclosure` 真裁：none 隐机构名、签署人姓名只给 owner。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
// file-upload 会拉起 server-only（pool 链），单测内 mock 掉上传落库（同 flow.test.ts）
vi.mock("@/lib/services/file-upload", () => ({
  saveProcurementScan: vi.fn(async (p: { filename: string }) => ({
    url: `/api/procurement/authorization-files/${p.filename}`,
    filename: p.filename,
  })),
}));
import { applyReviewDecision } from "@/lib/services/procurement/tender";

const NOW = 1_777_593_600;
const PID = 7;

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
  authorize_publish: 1,
};

function handlers(over: {
  authorizePublish?: number;
  deadline?: number | null;
  autoResult?: string | null;
  auth?: string;
  buyer?: string;
  dup?: unknown[];
} = {}): Handlers {
  const project = {
    ...PROJECT,
    authorize_publish: over.authorizePublish ?? 1,
    quote_deadline_at: over.deadline === undefined ? PROJECT.quote_deadline_at : over.deadline,
  };
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
    "AND callback_id = ?": () => [over.dup ?? []],
    "AND stage = 'auto'": () => (over.autoResult === null ? [[]] : [[{ result: over.autoResult ?? "pass" }]]),
    "SELECT tender_no FROM procurement_tenders": () => [[{ tender_no: "OSPT-2026-000003" }]],
  };
}

const approve = (extra: Record<string, unknown> = {}) => ({
  projectId: PID,
  version: 2,
  decision: "approved" as const,
  callbackId: "cb-1",
  at: NOW,
  ...extra,
});

describe("applyReviewDecision — 发布闸（2026-11 补齐三道）", () => {
  it("未勾选「授权云境OS发布给供应商」→ publish_blocked/authorize_publish，且不写投影", async () => {
    const { pool, conn, calls } = fakeDb(handlers({ authorizePublish: 0 }));
    const r = await applyReviewDecision(pool, approve());
    expect(r).toEqual({ ok: false, reason: "publish_blocked", blockedBy: "authorize_publish" });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(calls.find(([sql]) => sql.includes("INSERT INTO bid_notices"))).toBeUndefined();
  });

  it("缺少报价截止时间 → publish_blocked/deadline（否则发布后永不自动过期）", async () => {
    const { pool } = fakeDb(handlers({ deadline: null }));
    const r = await applyReviewDecision(pool, approve());
    expect(r).toEqual({ ok: false, reason: "publish_blocked", blockedBy: "deadline" });
  });

  it("自动初审判 need_info 且未推翻 → publish_blocked/auto_review", async () => {
    const { pool } = fakeDb(handlers({ autoResult: "need_info" }));
    const r = await applyReviewDecision(pool, approve());
    expect(r).toEqual({ ok: false, reason: "publish_blocked", blockedBy: "auto_review" });
  });

  it("推翻说明不足 10 字 → publish_blocked/override_reason", async () => {
    const { pool } = fakeDb(handlers({ autoResult: "risk" }));
    const r = await applyReviewDecision(pool, approve({ overrideAutoReview: true, overrideReason: "我确认" }));
    expect(r).toEqual({ ok: false, reason: "publish_blocked", blockedBy: "override_reason" });
  });

  it("显式推翻且说明充分 → 发布，并把 autoReview/override 写进核验证据", async () => {
    const { pool, calls } = fakeDb(handlers({ autoResult: "need_info" }));
    const overrideReason = "已电话核实交付地与截止时间，风险项由人工复核通过";
    const r = await applyReviewDecision(pool, approve({ overrideAutoReview: true, overrideReason }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("published");

    const insert = calls.find(([sql]) => sql.includes("INSERT INTO procurement_reviews"));
    expect(insert).toBeDefined();
    const evidence = JSON.parse(String((insert![1] as unknown[])[4])) as Record<string, unknown>;
    expect(evidence.autoReview).toBe("need_info");
    expect(evidence.override).toEqual({ reason: overrideReason });
    // 幂等键落库（列值与 evidence 同时写）
    expect((insert![1] as unknown[])[6]).toBe("cb-1");
    expect(evidence.callbackId).toBe("cb-1");
  });

  it("自动初审未留痕（best-effort 失败）时不阻断发布，但证据里标 missing", async () => {
    const { pool, calls } = fakeDb(handlers({ autoResult: null }));
    const r = await applyReviewDecision(pool, approve());
    expect(r.ok).toBe(true);
    const insert = calls.find(([sql]) => sql.includes("INSERT INTO procurement_reviews"));
    const evidence = JSON.parse(String((insert![1] as unknown[])[4])) as Record<string, unknown>;
    expect(evidence.autoReview).toBe("missing");
  });

  it("授权书未核验 → authorization_required（沿用既有专属码，不并入 publish_blocked）", async () => {
    const { pool } = fakeDb(handlers({ auth: "pending", authorizePublish: 0 }));
    const r = await applyReviewDecision(pool, approve());
    expect(r).toEqual({ ok: false, reason: "authorization_required" });
  });

  it("主体未认证 → buyer_not_verified（沿用既有专属码）", async () => {
    const { pool } = fakeDb(handlers({ buyer: "pending" }));
    const r = await applyReviewDecision(pool, approve());
    expect(r).toEqual({ ok: false, reason: "buyer_not_verified" });
  });
});

describe("applyReviewDecision — 回调幂等（迁移 018：callback_id 唯一键）", () => {
  it("同一回调键重复投递 → duplicate=true 回放首次结论，不改状态、不重复写留痕", async () => {
    const { pool, conn, calls } = fakeDb(handlers({ dup: [{ id: 77, result: "pass" }] }));
    const r = await applyReviewDecision(pool, approve());
    expect(r).toEqual({
      ok: true,
      status: "submitted",
      version: 2,
      duplicate: true,
      tenderNo: "OSPT-2026-000003",
    });
    expect(conn.commit).not.toHaveBeenCalled();
    expect(calls.find(([sql]) => sql.includes("INSERT INTO procurement_reviews"))).toBeUndefined();
  });

  it("缺 X-Review-Request-Id 时用内容指纹兜底，两次同内容投递命同一条去重键", async () => {
    const { pool, calls } = fakeDb(handlers({ autoResult: "pass" }));
    await applyReviewDecision(pool, approve({ callbackId: "" }));
    const insert = calls.find(([sql]) => sql.includes("INSERT INTO procurement_reviews"));
    const stored = String((insert![1] as unknown[])[6]);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it("去重查询走 callback_id 列，不再对 JSON 列做 LIKE（历史缺陷回归）", async () => {
    const { pool, calls } = fakeDb(handlers());
    await applyReviewDecision(pool, approve());
    const sqls = calls.map(([sql]) => sql);
    expect(sqls.some((s) => s.includes("AND callback_id = ?"))).toBe(true);
    expect(sqls.some((s) => s.includes("evidence LIKE"))).toBe(false);
  });
});
