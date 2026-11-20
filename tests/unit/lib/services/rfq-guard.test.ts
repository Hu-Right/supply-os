/**
 * 平台公告守护（platform_notice_guard）对账/登记服务单测
 *
 * @module tests/unit/lib/services/rfq-guard
 * @description 以 mock pool 验证：登记表总数计数、偏差行映射（含主行消失时的 null 归一）、
 *              预期类型码参与对账谓词，以及登记的幂等 upsert 参数。不连真库。
 *              历史：原 rfq_guard 类型码硬编码 RFQ；P1a 起按发布方式映射 expected_notice_type。
 */
import { describe, it, expect, vi } from "vitest";
import { reconcilePlatformNoticeGuard, registerPlatformNoticeGuard } from "@/lib/services/rfq-guard";

function mockPool(queryImpl: ReturnType<typeof vi.fn>) {
  return { query: queryImpl } as unknown as Parameters<typeof reconcilePlatformNoticeGuard>[0];
}

describe("reconcilePlatformNoticeGuard", () => {
  it("返回登记总数并映射偏差行", async () => {
    const query = vi
      .fn()
      // 第 1 次：COUNT(*)
      .mockResolvedValueOnce([[{ total: 7 }]])
      // 第 2 次：偏差明细（主行被改写为 crawl）
      .mockResolvedValueOnce([[
        {
          noticeId: 1786544287,
          reference: "OSPR-2026-000001",
          expectUserId: 6,
          expectedNoticeType: "EOI",
          curSource: "crawl",
          curType: "BID",
          curUserId: null,
        },
      ]]);

    const res = await reconcilePlatformNoticeGuard(mockPool(query));

    expect(res.checked).toBe(7);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]).toMatchObject({
      noticeId: 1786544287,
      reference: "OSPR-2026-000001",
      expectUserId: 6,
      expectedNoticeType: "EOI",
      curSource: "crawl",
      curType: "BID",
      curUserId: null,
    });
    // 偏差查询走 LEFT JOIN + 非 platform/类型码漂移/归属不符 谓词
    const detailSql = String(query.mock.calls[1]?.[0] ?? "");
    expect(detailSql).toContain("LEFT JOIN bid_notices");
    expect(detailSql).toContain("n.entry_source <> 'platform'");
    expect(detailSql).toContain("n.notice_type <> g.expected_notice_type");
  });

  it("主行消失时 null 字段归一为 null、无偏差返回空数组", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const res = await reconcilePlatformNoticeGuard(mockPool(query));
    expect(res.checked).toBe(0);
    expect(res.violations).toEqual([]);
  });
});

describe("registerPlatformNoticeGuard", () => {
  it("以幂等 upsert 登记预期归属与预期类型码", async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    await registerPlatformNoticeGuard(mockPool(query), {
      noticeId: 9001,
      reference: "OSPR-2026-000001",
      userId: 6,
      expectedNoticeType: "EOI",
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO platform_notice_guard");
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(params).toEqual([9001, "OSPR-2026-000001", 6, "EOI"]);
  });
});
