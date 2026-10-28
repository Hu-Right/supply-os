/**
 * rfq-guard 对账/登记服务单测
 *
 * @module tests/unit/lib/services/rfq-guard
 * @description 以 mock pool 验证：登记表总数计数、偏差行映射（含主行消失时的 null 归一）、
 *              以及 create 登记的幂等 upsert 参数。不连真库。
 */
import { describe, it, expect, vi } from "vitest";
import { reconcileRfqGuard, registerRfqGuard } from "@/lib/services/rfq-guard";

function mockPool(queryImpl: ReturnType<typeof vi.fn>) {
  return { query: queryImpl } as unknown as Parameters<typeof reconcileRfqGuard>[0];
}

describe("reconcileRfqGuard", () => {
  it("返回登记总数并映射偏差行", async () => {
    const query = vi
      .fn()
      // 第 1 次：COUNT(*)
      .mockResolvedValueOnce([[{ total: 7 }]])
      // 第 2 次：偏差明细（主行被改写为 crawl）
      .mockResolvedValueOnce([[
        {
          rfqId: 1786544287,
          reference: "OSRFQ-0001786544287",
          expectUserId: 6,
          curSource: "crawl",
          curType: "BID",
          curUserId: null,
        },
      ]]);

    const res = await reconcileRfqGuard(mockPool(query));

    expect(res.checked).toBe(7);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]).toMatchObject({
      rfqId: 1786544287,
      reference: "OSRFQ-0001786544287",
      expectUserId: 6,
      curSource: "crawl",
      curType: "BID",
      curUserId: null,
    });
    // 偏差查询走 LEFT JOIN + 非 platform/RFQ/归属不符 谓词
    const detailSql = String(query.mock.calls[1]?.[0] ?? "");
    expect(detailSql).toContain("LEFT JOIN bid_notices");
    expect(detailSql).toContain("n.entry_source <> 'platform'");
  });

  it("主行消失时 null 字段归一为 null、无偏差返回空数组", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const res = await reconcileRfqGuard(mockPool(query));
    expect(res.checked).toBe(0);
    expect(res.violations).toEqual([]);
  });
});

describe("registerRfqGuard", () => {
  it("以幂等 upsert 登记预期归属", async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    await registerRfqGuard(mockPool(query), {
      rfqId: 9001,
      reference: "OSRFQ-000000009001",
      userId: 6,
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO rfq_guard");
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(params).toEqual([9001, "OSRFQ-000000009001", 6]);
  });
});
