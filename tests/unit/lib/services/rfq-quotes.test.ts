/**
 * rfq-quotes 服务单测（mock pool，不连真库）
 *
 * @module tests/unit/lib/services/rfq-quotes
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  isVerifiedSupplier,
  checkQuoteEligibility,
  submitQuote,
  awardQuote,
  withdrawQuote,
  unawardQuote,
  type QuoteableRfq,
} from "@/lib/services/rfq-quotes";

function pool(query: ReturnType<typeof vi.fn>, getConnection?: ReturnType<typeof vi.fn>): Pool {
  return { query, ...(getConnection ? { getConnection } : {}) } as unknown as Pool;
}

const publishedRfq: QuoteableRfq = {
  id: 5, userId: 6, status: "published", visibility: "public", deadlineSec: 0, title: "采购 X", contactEmail: "buyer@x.com",
};

describe("isVerifiedSupplier", () => {
  it("verified + 绑定 supplier + 账号正常 → true", async () => {
    const q = vi.fn().mockResolvedValue([[{ supplier_link_status: "verified", supplier_id: 1, account_status: "active" }]]);
    expect(await isVerifiedSupplier(pool(q), 42)).toBe(true);
  });
  it("未 verified → false", async () => {
    const q = vi.fn().mockResolvedValue([[{ supplier_link_status: "none", supplier_id: null, account_status: "active" }]]);
    expect(await isVerifiedSupplier(pool(q), 42)).toBe(false);
  });
  it("账号 disabled → false", async () => {
    const q = vi.fn().mockResolvedValue([[{ supplier_link_status: "verified", supplier_id: 1, account_status: "disabled" }]]);
    expect(await isVerifiedSupplier(pool(q), 42)).toBe(false);
  });
});

describe("checkQuoteEligibility", () => {
  it("rfq 为空 → not_found（不查库）", async () => {
    const q = vi.fn();
    expect(await checkQuoteEligibility(pool(q), null, 42)).toEqual({ ok: false, reason: "not_found" });
    expect(q).not.toHaveBeenCalled();
  });
  it("非 published → not_open", async () => {
    const q = vi.fn();
    const rfq = { ...publishedRfq, status: "draft" };
    expect(await checkQuoteEligibility(pool(q), rfq, 42)).toEqual({ ok: false, reason: "not_open" });
  });
  it("截止已过 → expired", async () => {
    const q = vi.fn();
    const rfq = { ...publishedRfq, deadlineSec: Math.floor(Date.now() / 1000) - 10 };
    expect(await checkQuoteEligibility(pool(q), rfq, 42)).toEqual({ ok: false, reason: "expired" });
  });
  it("对自家 published RFQ 报价 → self（不查库）", async () => {
    const q = vi.fn();
    expect(await checkQuoteEligibility(pool(q), publishedRfq, 6)).toEqual({ ok: false, reason: "self" });
    expect(q).not.toHaveBeenCalled();
  });
  it("非认证供应商 → not_supplier", async () => {
    const q = vi.fn().mockResolvedValue([[{ supplier_link_status: "none", supplier_id: null, account_status: "active" }]]);
    expect(await checkQuoteEligibility(pool(q), publishedRfq, 42)).toEqual({ ok: false, reason: "not_supplier" });
  });
  it("targeted 未邀约 → not_invited", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ supplier_link_status: "verified", supplier_id: 1, account_status: "active" }]])
      .mockResolvedValueOnce([[]]);
    const rfq = { ...publishedRfq, visibility: "targeted" };
    expect(await checkQuoteEligibility(pool(q), rfq, 42)).toEqual({ ok: false, reason: "not_invited" });
  });
  it("public + 认证 + 未选定 → ok", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ supplier_link_status: "verified", supplier_id: 1, account_status: "active" }]])
      .mockResolvedValueOnce([[]]);
    expect(await checkQuoteEligibility(pool(q), publishedRfq, 42)).toEqual({ ok: true });
  });
  it("已选定（存在 won 报价）→ awarded（参数化状态）", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ supplier_link_status: "verified", supplier_id: 1, account_status: "active" }]])
      .mockResolvedValueOnce([[{ 1: 1 }]]);
    expect(await checkQuoteEligibility(pool(q), publishedRfq, 42)).toEqual({ ok: false, reason: "awarded" });
    const awardedCall = q.mock.calls[1];
    expect(String(awardedCall?.[0])).toContain("FROM rfq_quotes");
    expect(awardedCall?.[1]).toEqual([5, "won"]);
  });
});

describe("submitQuote", () => {
  it("upsert 报价并通知采购方（两次查询：报价 + 站内信）", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([{ insertId: 777, affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 1 }]);
    const res = await submitQuote(pool(q), {
      rfqId: 5, userId: 42, price: 100, currency: "CNY", leadTimeDays: 30,
      deliveryTerms: "DDP", note: "含税", buyerUserId: 6, rfqTitle: "采购 X",
    });
    expect(res).toEqual({ quoteId: 777 });
    const [insertSql, insertParams] = q.mock.calls[0];
    expect(String(insertSql)).toContain("INSERT INTO rfq_quotes");
    expect(String(insertSql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(insertParams).toEqual([5, 42, 100, "CNY", 30, "DDP", "含税", "submitted"]);
    // 第 2 次为站内信写入（通知采购方）
    expect(String(q.mock.calls[1]?.[0])).toContain("INSERT INTO notifications");
  });

  it("站内信失败不影响报价落库", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([{ insertId: 777, affectedRows: 1 }])
      .mockRejectedValueOnce(new Error("notify down"));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await submitQuote(pool(q), {
      rfqId: 5, userId: 42, price: 1, currency: "CNY", buyerUserId: 6, rfqTitle: "t",
    });
    expect(res).toEqual({ quoteId: 777 });
    spy.mockRestore();
  });
});

describe("awardQuote", () => {
  it("中标置 won、其余 rejected，并通知中标者", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ user_id: 6, rfq_status: "published" }]])
        .mockResolvedValueOnce([[{ supplier_user_id: 42 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const getConnection = vi.fn().mockResolvedValue(conn);
    const p = pool(vi.fn().mockResolvedValue([{ insertId: 999 }]), getConnection);

    const res = await awardQuote(p, { rfqId: 5, winnerQuoteId: 7, buyerUserId: 6 });
    expect(res).toEqual({ ok: true, winnerSupplierUserId: 42, rejectedCount: 2 });
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    // 中标/落选均参数化（不裸拼状态值入 SQL）
    expect(String(conn.query.mock.calls[2]?.[0])).toContain("SET status = ?");
    expect(conn.query.mock.calls[2]?.[1]).toEqual(["won", 7, 5]);
    expect(String(conn.query.mock.calls[3]?.[0])).toContain("SET status = ?");
    expect(conn.query.mock.calls[3]?.[1]).toEqual(["rejected", 5, 7, "submitted"]);
  });

  it("非创建者 → forbidden 并回滚", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[{ user_id: 99 }]]),
      commit: vi.fn(), rollback: vi.fn().mockResolvedValue(undefined), release: vi.fn(),
    };
    const p = pool(vi.fn(), vi.fn().mockResolvedValue(conn));
    const res = await awardQuote(p, { rfqId: 5, winnerQuoteId: 7, buyerUserId: 6 });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("中标报价不存在 → no_winner 并回滚", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ user_id: 6, rfq_status: "published" }]])
        .mockResolvedValueOnce([[]]),
      commit: vi.fn(), rollback: vi.fn().mockResolvedValue(undefined), release: vi.fn(),
    };
    const p = pool(vi.fn(), vi.fn().mockResolvedValue(conn));
    const res = await awardQuote(p, { rfqId: 5, winnerQuoteId: 7, buyerUserId: 6 });
    expect(res).toEqual({ ok: false, reason: "no_winner" });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it("非 published（已撤回） → closed 并回滚", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[{ user_id: 6, rfq_status: "closed" }]]),
      commit: vi.fn(), rollback: vi.fn().mockResolvedValue(undefined), release: vi.fn(),
    };
    const p = pool(vi.fn(), vi.fn().mockResolvedValue(conn));
    const res = await awardQuote(p, { rfqId: 5, winnerQuoteId: 7, buyerUserId: 6 });
    expect(res).toEqual({ ok: false, reason: "closed" });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("中标为买家自己 → self 并回滚", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ user_id: 6, rfq_status: "published" }]])
        .mockResolvedValueOnce([[{ supplier_user_id: 6 }]]),
      commit: vi.fn(), rollback: vi.fn().mockResolvedValue(undefined), release: vi.fn(),
    };
    const p = pool(vi.fn(), vi.fn().mockResolvedValue(conn));
    const res = await awardQuote(p, { rfqId: 5, winnerQuoteId: 7, buyerUserId: 6 });
    expect(res).toEqual({ ok: false, reason: "self" });
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe("withdrawQuote", () => {
  it("命中 submitted 报价 → true（参数化 with 仅 submitted）", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    expect(await withdrawQuote(pool(q), 77, 42)).toBe(true);
    expect(String(q.mock.calls[0][0])).toContain("status = ?");
    expect(q.mock.calls[0][1]).toEqual(["withdrawn", 77, 42, "submitted"]);
  });
  it("未命中（非本人/非 submitted）→ false", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 0 }]);
    expect(await withdrawQuote(pool(q), 77, 42)).toBe(false);
  });
});

describe("unawardQuote", () => {
  it("有 won → 回退 won/rejected 为 submitted，并 commit", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ rfq_status: "published", user_id: 6 }]])
        .mockResolvedValueOnce([[{ supplier_user_id: 42 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const p = pool(vi.fn().mockResolvedValue([{ insertId: 9 }]), vi.fn().mockResolvedValue(conn));
    const res = await unawardQuote(p, { rfqId: 5, buyerUserId: 6 });
    expect(res).toEqual({ ok: true, winnerSupplierUserId: 42 });
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query.mock.calls[2]?.[1]).toEqual(["submitted", 5, "won"]);
    expect(conn.query.mock.calls[3]?.[1]).toEqual(["submitted", 5, "rejected"]);
    expect(conn.release).toHaveBeenCalled();
  });
  it("非创建者 → forbidden 并回滚", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[{ rfq_status: "published", user_id: 99 }]]),
      commit: vi.fn(), rollback: vi.fn().mockResolvedValue(undefined), release: vi.fn(),
    };
    const p = pool(vi.fn(), vi.fn().mockResolvedValue(conn));
    expect(await unawardQuote(p, { rfqId: 5, buyerUserId: 6 })).toEqual({ ok: false, reason: "forbidden" });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it("无 won → no_winner 并回滚", async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ rfq_status: "published", user_id: 6 }]])
        .mockResolvedValueOnce([[]]),
      commit: vi.fn(), rollback: vi.fn().mockResolvedValue(undefined), release: vi.fn(),
    };
    const p = pool(vi.fn(), vi.fn().mockResolvedValue(conn));
    expect(await unawardQuote(p, { rfqId: 5, buyerUserId: 6 })).toEqual({ ok: false, reason: "no_winner" });
    expect(conn.rollback).toHaveBeenCalled();
  });
});
