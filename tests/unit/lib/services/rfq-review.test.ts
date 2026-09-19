/**
 * RFQ 审核服务测试
 * @module tests/unit/lib/services/rfq-review.test.ts
 * @description 验证 pending_review → published/rejected 的状态流转与幂等 WHERE 约束。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reviewRfq } from "@/lib/services/rfq/review";

describe("reviewRfq", () => {
  const execute = vi.fn();
  const pool = { execute } as any;

  beforeEach(() => execute.mockReset());

  it("approve → published，且仅命中 pending_review 行", async () => {
    execute.mockResolvedValue([{ affectedRows: 1 }]);
    const ok = await reviewRfq(pool, 10, "approve");
    expect(ok).toBe(true);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("rfq_status = ?");
    expect(sql).toContain("rfq_status = ?");
    expect(params[0]).toBe("published");
    expect(params[1]).toBe(10);
    expect(params[2]).toBe("pending_review");
  });

  it("reject → rejected", async () => {
    execute.mockResolvedValue([{ affectedRows: 1 }]);
    await reviewRfq(pool, 10, "reject");
    expect(execute.mock.calls[0][1][0]).toBe("rejected");
  });

  it("目标非待审核/不存在 → affectedRows=0 → false（幂等安全）", async () => {
    execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await reviewRfq(pool, 10, "approve")).toBe(false);
  });
});
