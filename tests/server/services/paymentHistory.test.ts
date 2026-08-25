/**
 * server/services/paymentHistory — mapOrderRow / mapUnlockRow / listOrderHistory / listUnlockHistory 测试
 */
import { describe, it, expect, vi } from "vitest";

// 测试 mapOrderRow 和 mapUnlockRow 的映射逻辑
// 由于这两个函数未导出，我们通过 listOrderHistory / listUnlockHistory 间接测试

vi.mock("../../../server/services/translation/notice", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: true, en: true },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn().mockResolvedValue({ translations: ["翻译标题", "翻译描述"], provider: "mock" }),
}));

import { listOrderHistory, listUnlockHistory } from "../../../server/services/paymentHistory";

function createMockRepo() {
  return {
    countOrders: vi.fn().mockResolvedValue(2),
    listOrders: vi.fn().mockResolvedValue([]),
    countUnlocks: vi.fn().mockResolvedValue(1),
    listUnlocks: vi.fn().mockResolvedValue([]),
    upsertNoticeTranslation: vi.fn(),
  } as any;
}

describe("listOrderHistory", () => {
  it("返回分页结构", async () => {
    const repo = createMockRepo();
    repo.listOrders.mockResolvedValue([
      {
        order_no: "ORD-001", user_key: "u@t.com", provider: "mock", plan_code: "pro",
        notice_id: null, amount: 99, currency: "CNY", status: "paid",
        created_at: "2026-01-01", updated_at: "2026-01-01",
      },
    ]);

    const result = await listOrderHistory(repo, { userKey: "u@t.com", status: "paid", page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].order_no).toBe("ORD-001");
    expect(result.list[0].amount).toBe(99);
    expect(result.list[0].notice).toBeNull();
  });

  it("有 notice_id 时附带 notice 对象", async () => {
    const repo = createMockRepo();
    repo.listOrders.mockResolvedValue([
      {
        order_no: "ORD-002", user_key: "u@t.com", provider: "mock", plan_code: "pro",
        notice_id: 42, external_notice_id: "EXT-42", source_channel: "UN",
        reference: "REF-42", title: "Test Notice", notice_type: "bid",
        agency: "WHO", country: "Kenya", deadline: "2026-12-31",
        url: "https://example.com", industry: "Health",
        amount: 50, currency: "USD", status: "pending",
        created_at: "2026-01-01", updated_at: "2026-01-01",
      },
    ]);

    const result = await listOrderHistory(repo, { userKey: "u@t.com", status: "", page: 1, limit: 10 });

    expect(result.list[0].notice).not.toBeNull();
    expect(result.list[0].notice!.id).toBe(42);
    expect(result.list[0].notice!.agency).toBe("WHO");
  });

  it("offset 计算正确（page 3, limit 10 → offset 20）", async () => {
    const repo = createMockRepo();
    await listOrderHistory(repo, { userKey: "u@t.com", status: "", page: 3, limit: 10 });

    expect(repo.listOrders).toHaveBeenCalledWith("u@t.com", "", 10, 20);
  });
});

describe("listUnlockHistory", () => {
  it("返回分页结构", async () => {
    const repo = createMockRepo();
    repo.listUnlocks.mockResolvedValue([
      {
        user_key: "u@t.com", notice_id: 10, unlock_type: "free", price: 0,
        unlocked_at: "2026-01-01", external_notice_id: "EXT-10",
        source_channel: "UN", reference: "REF-10", title: "Notice",
        notice_type: "bid", agency: "UNDP", country: "Kenya",
        deadline: "2026-12-31", deadline_ts: null, url: "https://x.com",
        industry: "IT",
      },
    ]);

    const result = await listUnlockHistory(repo, { userKey: "u@t.com", lang: "zh", page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].notice_id).toBe(10);
  });

  it("不可翻译语言 → title_i18n 为 undefined", async () => {
    const repo = createMockRepo();
    repo.listUnlocks.mockResolvedValue([
      {
        user_key: "u@t.com", notice_id: 5, unlock_type: "single", price: 10,
        unlocked_at: "2026-01-01", external_notice_id: "EXT-5",
        source_channel: "UN", reference: "REF-5", title: "Notice",
        notice_type: "bid", agency: "WB", country: "Brazil",
        deadline: "2026-06-30", deadline_ts: null, url: "", industry: "",
      },
    ]);

    const result = await listUnlockHistory(repo, { userKey: "u@t.com", lang: "xx", page: 1, limit: 10 });

    // lang=xx 不在 NOTICE_TRANSLATION_LANGS 中，title_i18n 应为 undefined
    expect(result.list[0].notice!.title_i18n).toBeUndefined();
  });

  it("deadline_ts 过期判定", async () => {
    const repo = createMockRepo();
    const pastTs = Math.floor(Date.now() / 1000) - 86400; // 昨天（秒级）
    repo.listUnlocks.mockResolvedValue([
      {
        user_key: "u@t.com", notice_id: 1, unlock_type: "free", price: 0,
        unlocked_at: "2026-01-01", external_notice_id: "EXT-1",
        source_channel: "UN", reference: "REF-1", title: "Past",
        notice_type: "bid", agency: "A", country: "B",
        deadline: "2020-01-01", deadline_ts: pastTs, url: "", industry: "",
      },
    ]);

    const result = await listUnlockHistory(repo, { userKey: "u@t.com", lang: "en", page: 1, limit: 10 });
    expect(result.list[0].notice!.deadline_expired).toBe(true);
  });
});
