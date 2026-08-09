// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { listOrderHistory, listUnlockHistory } from "../../../server/services/paymentHistory";

// Mock the notice-translation module
vi.mock("../../../server/services/notice-translation", () => ({
  NOTICE_TRANSLATION_LANGS: { zh: true, en: true, fr: true },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn().mockResolvedValue({
    translations: ["翻译标题", "翻译描述"],
    provider: "deepseek-v4-flash",
  }),
}));

/** Create a mock PaymentsRepo */
function createMockRepo(overrides: Record<string, any> = {}) {
  const mock: Record<string, any> = {
    countOrders: vi.fn().mockResolvedValue(0),
    listOrders: vi.fn().mockResolvedValue([]),
    countUnlocks: vi.fn().mockResolvedValue(0),
    listUnlocks: vi.fn().mockResolvedValue([]),
    upsertNoticeTranslation: vi.fn().mockResolvedValue(undefined),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (mock[key]) {
      mock[key].mockResolvedValue(value);
    }
  }
  return mock as any;
}

// ─── listOrderHistory ──────────────────────────────────────────────────────
describe("listOrderHistory", () => {
  it("returns paginated empty result", async () => {
    const repo = createMockRepo();
    const result = await listOrderHistory(repo, {
      userKey: "u@x.com",
      status: "",
      page: 1,
      limit: 10,
    });
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.list).toEqual([]);
    expect(repo.countOrders).toHaveBeenCalledWith("u@x.com", "");
    expect(repo.listOrders).toHaveBeenCalledWith("u@x.com", "", 10, 0);
  });

  it("maps order rows with notice info", async () => {
    const orderRow = {
      order_no: "PAY-1",
      user_key: "u@x.com",
      provider: "mock",
      plan_code: "annual",
      notice_id: 42,
      amount: 5600,
      currency: "CNY",
      status: "paid",
      provider_trade_no: "TRADE-1",
      paid_at: "2026-07-01",
      created_at: "2026-06-30",
      updated_at: "2026-07-01",
      external_notice_id: "EXT-42",
      source_channel: "ungm",
      reference: "REF-042",
      title: "Water Pump",
      notice_type: "Tender",
      agency: "UNDP",
      agency_full: "United Nations Development Programme",
      country: "Brazil",
      deadline: "2026-09-01",
      urgency: "high",
      url: "http://undp.org/bid",
      industry: "water",
    };
    const repo = createMockRepo({ countOrders: 1, listOrders: [orderRow] });
    const result = await listOrderHistory(repo, {
      userKey: "u@x.com",
      status: "paid",
      page: 1,
      limit: 10,
    });
    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
    const mapped = result.list[0];
    expect(mapped.order_no).toBe("PAY-1");
    expect(mapped.amount).toBe(5600);
    expect(mapped.notice).not.toBeNull();
    expect(mapped.notice.id).toBe(42);
    expect(mapped.notice.notice_id).toBe("EXT-42");
    expect(mapped.notice.agency).toBe("UNDP");
  });

  it("returns null notice when notice_id is absent", async () => {
    const orderRow = {
      order_no: "PAY-2",
      user_key: "u@x.com",
      provider: "mock",
      plan_code: "single",
      notice_id: null,
      amount: 89,
      currency: "CNY",
      status: "paid",
    };
    const repo = createMockRepo({ countOrders: 1, listOrders: [orderRow] });
    const result = await listOrderHistory(repo, {
      userKey: "u@x.com",
      status: "",
      page: 1,
      limit: 10,
    });
    expect(result.list[0].notice).toBeNull();
  });

  it("calculates correct offset for page > 1", async () => {
    const repo = createMockRepo();
    await listOrderHistory(repo, {
      userKey: "u@x.com",
      status: "",
      page: 3,
      limit: 20,
    });
    expect(repo.listOrders).toHaveBeenCalledWith("u@x.com", "", 20, 40);
  });

  it("uses agency_full as fallback when agency is empty", async () => {
    const orderRow = {
      order_no: "PAY-3",
      user_key: "u@x.com",
      notice_id: 1,
      amount: 0,
      agency: "",
      agency_full: "Full Agency Name",
      external_notice_id: "EXT-1",
    };
    const repo = createMockRepo({ countOrders: 1, listOrders: [orderRow] });
    const result = await listOrderHistory(repo, {
      userKey: "u@x.com",
      status: "",
      page: 1,
      limit: 10,
    });
    expect(result.list[0].notice.agency).toBe("Full Agency Name");
  });
});

// ─── listUnlockHistory ─────────────────────────────────────────────────────
describe("listUnlockHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated empty result", async () => {
    const repo = createMockRepo();
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "en",
      page: 1,
      limit: 10,
    });
    expect(result.total).toBe(0);
    expect(result.list).toEqual([]);
  });

  it("maps unlock rows with translatable flag for supported languages", async () => {
    const unlockRow = {
      user_key: "u@x.com",
      notice_id: 42,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
      external_notice_id: "EXT-42",
      source_channel: "ungm",
      reference: "REF-042",
      title: "Water Pump",
      title_i18n: null,
      notice_type: "Tender",
      agency: "UNDP",
      agency_full: null,
      country: "Brazil",
      deadline: "2026-09-01",
      deadline_ts: null,
      urgency: "normal",
      url: "http://undp.org",
      industry: "water",
      description: "Some description",
    };
    const repo = createMockRepo({ countUnlocks: 1, listUnlocks: [unlockRow] });
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "zh",
      page: 1,
      limit: 10,
    });
    expect(result.list).toHaveLength(1);
    // zh is translatable → title_i18n should be present (null initially)
    expect(result.list[0].notice.title_i18n).toBeNull();
  });

  it("does not include title_i18n for unsupported languages", async () => {
    const unlockRow = {
      user_key: "u@x.com",
      notice_id: 42,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
      title: "Water Pump",
      title_i18n: null,
      external_notice_id: "EXT-42",
    };
    const repo = createMockRepo({ countUnlocks: 1, listUnlocks: [unlockRow] });
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "ja",
      page: 1,
      limit: 10,
    });
    // ja is not in NOTICE_TRANSLATION_LANGS → title_i18n is undefined
    expect(result.list[0].notice.title_i18n).toBeUndefined();
  });

  it("computes deadline_expired for notices with deadline_ts", async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days from now (seconds)
    const pastTs = Math.floor(Date.now() / 1000) - 86400; // 1 day ago (seconds)
    const unlockRow1 = {
      user_key: "u@x.com",
      notice_id: 1,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
      title: "Future",
      deadline_ts: futureTs,
      external_notice_id: "EXT-1",
    };
    const unlockRow2 = {
      user_key: "u@x.com",
      notice_id: 2,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
      title: "Past",
      deadline_ts: pastTs,
      external_notice_id: "EXT-2",
    };
    const repo = createMockRepo({ countUnlocks: 2, listUnlocks: [unlockRow1, unlockRow2] });
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "en",
      page: 1,
      limit: 10,
    });
    expect(result.list[0].notice.deadline_expired).toBe(false);
    expect(result.list[1].notice.deadline_expired).toBe(true);
  });

  it("handles millisecond timestamps in deadline_ts", async () => {
    const futureTsMs = Date.now() + 86400 * 1000 * 30; // 30 days in ms
    const unlockRow = {
      user_key: "u@x.com",
      notice_id: 1,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
      title: "Future MS",
      deadline_ts: futureTsMs,
      external_notice_id: "EXT-1",
    };
    const repo = createMockRepo({ countUnlocks: 1, listUnlocks: [unlockRow] });
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "en",
      page: 1,
      limit: 10,
    });
    expect(result.list[0].notice.deadline_expired).toBe(false);
  });

  it("returns null deadline_expired when deadline_ts is absent", async () => {
    const unlockRow = {
      user_key: "u@x.com",
      notice_id: 1,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
      title: "No deadline",
      deadline_ts: null,
      external_notice_id: "EXT-1",
    };
    const repo = createMockRepo({ countUnlocks: 1, listUnlocks: [unlockRow] });
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "en",
      page: 1,
      limit: 10,
    });
    expect(result.list[0].notice.deadline_expired).toBeNull();
  });

  it("returns null notice when notice_id is absent", async () => {
    const unlockRow = {
      user_key: "u@x.com",
      notice_id: null,
      unlock_type: "free",
      price: 0,
      unlocked_at: "2026-07-01",
    };
    const repo = createMockRepo({ countUnlocks: 1, listUnlocks: [unlockRow] });
    const result = await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "en",
      page: 1,
      limit: 10,
    });
    expect(result.list[0].notice).toBeNull();
  });

  it("passes lang to listUnlocks when translatable", async () => {
    const repo = createMockRepo();
    await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "fr",
      page: 1,
      limit: 10,
    });
    expect(repo.listUnlocks).toHaveBeenCalledWith("u@x.com", 10, 0, { lang: "fr" });
  });

  it("passes null lang to listUnlocks when not translatable", async () => {
    const repo = createMockRepo();
    await listUnlockHistory(repo, {
      userKey: "u@x.com",
      lang: "ja",
      page: 1,
      limit: 10,
    });
    expect(repo.listUnlocks).toHaveBeenCalledWith("u@x.com", 10, 0, null);
  });
});
