/**
 * RFQ 通知去重单测（mock pool）
 * @module tests/unit/lib/services/rfq/notify
 *
 * `notifications` 表没有唯一键，重复推送会刷屏；本测试锁定"按 (user,type,ref) 只推一次"。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { notifyDemandExpired, notifyReviewResult, pushNotificationOnce } from "@/lib/services/rfq/notify";

function fakePool(existing: boolean) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.startsWith("SELECT 1 FROM notifications")) return [existing ? [{ 1: 1 }] : []];
      if (sql.startsWith("INSERT INTO notifications")) return [{ insertId: 9 }];
      return [{ affectedRows: 1 }];
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

describe("pushNotificationOnce", () => {
  it("首次推送写入并返回 true", async () => {
    const { pool, calls } = fakePool(false);
    const ok = await pushNotificationOnce(pool, {
      userId: 42, type: "rfq_review_approved", title: "通过", refId: 7,
    });
    expect(ok).toBe(true);
    expect(calls.some(([sql]) => sql.startsWith("INSERT INTO notifications"))).toBe(true);
  });

  it("同 (user,type,ref) 已存在 → 跳过，不重复写", async () => {
    const { pool, calls } = fakePool(true);
    const ok = await pushNotificationOnce(pool, {
      userId: 42, type: "rfq_review_approved", title: "通过", refId: 7,
    });
    expect(ok).toBe(false);
    expect(calls.some(([sql]) => sql.startsWith("INSERT INTO notifications"))).toBe(false);
  });

  it("无 refId 时不去重（系统公告类）", async () => {
    const { pool, calls } = fakePool(true);
    const ok = await pushNotificationOnce(pool, { userId: 42, type: "system", title: "hi" });
    expect(ok).toBe(true);
    expect(calls.some(([sql]) => sql.startsWith("SELECT 1 FROM notifications"))).toBe(false);
  });
});

describe("语义化通知", () => {
  it("审核通过 / 退回使用不同类型与文案", async () => {
    const approved = fakePool(false);
    await notifyReviewResult(approved.pool, {
      demandId: 7, buyerUserId: 42, title: "采购光伏组件", approved: true,
    });
    const insertA = approved.calls.find(([sql]) => sql.startsWith("INSERT INTO notifications"))!;
    expect(insertA[1]).toContain("rfq_review_approved");
    expect(String(insertA[1]?.[2])).toContain("通过");

    const rejected = fakePool(false);
    await notifyReviewResult(rejected.pool, {
      demandId: 7, buyerUserId: 42, title: "采购光伏组件", approved: false, reason: "描述缺少技术规格",
    });
    const insertR = rejected.calls.find(([sql]) => sql.startsWith("INSERT INTO notifications"))!;
    expect(insertR[1]).toContain("rfq_review_rejected");
    expect(String(insertR[1]?.[3])).toContain("描述缺少技术规格");
  });

  it("到期通知带需求链接与 refId", async () => {
    const { pool, calls } = fakePool(false);
    await notifyDemandExpired(pool, { demandId: 11, buyerUserId: 5, title: "采购钢材" });
    const insert = calls.find(([sql]) => sql.startsWith("INSERT INTO notifications"))!;
    expect(insert[1]).toContain("rfq_demand_expired");
    expect(insert[1]).toContain("/rfq/11");
    expect(insert[1]).toContain(11);
  });
});
