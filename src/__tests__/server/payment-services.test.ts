// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listOrderHistory,
  listUnlockHistory,
} from "../../../server/services/paymentHistory";
import {
  BILLING_PLANS,
  activateSubscription,
  fulfillMockPayment,
  createLegacyOrder,
} from "../../../server/services/paymentFulfillment";
import { pendingNoticeTranslations, translateNoticeViaChain } from "../../../server/services/notice-translation";

// 隔离翻译链：只保留 paymentHistory 依赖的三个导出
vi.mock("../../../server/services/notice-translation", () => ({
  NOTICE_TRANSLATION_LANGS: {
    zh: "Simplified Chinese",
    en: "English",
    fr: "French",
    ru: "Russian",
    es: "Spanish",
    ar: "Arabic",
  },
  pendingNoticeTranslations: new Map(),
  translateNoticeViaChain: vi.fn(),
}));

// ─── listOrderHistory ───────────────────────────────────────────────────────
describe("listOrderHistory", () => {
  const makeRepo = (rows: any[], total = rows.length) => ({
    countOrders: vi.fn().mockResolvedValue(total),
    listOrders: vi.fn().mockResolvedValue(rows),
  });

  const orderRow = (overrides: Record<string, any> = {}) => ({
    order_no: "SO1",
    user_key: "a@b.com",
    provider: "mock",
    plan_code: "annual",
    notice_id: null,
    amount: "5600",
    currency: "CNY",
    status: "paid",
    provider_trade_no: "MOCK-SO1",
    paid_at: "2026-01-02",
    created_at: "2026-01-01",
    updated_at: "2026-01-02",
    external_notice_id: null,
    source_channel: null,
    reference: null,
    title: null,
    notice_type: null,
    agency: null,
    agency_full: null,
    country: null,
    deadline: null,
    urgency: null,
    url: null,
    industry: null,
    ...overrides,
  });

  it("computes offset from page/limit and passes status filter", async () => {
    const repo = makeRepo([]);
    const result = await listOrderHistory(repo as any, {
      userKey: "a@b.com",
      status: "paid",
      page: 3,
      limit: 10,
    });
    expect(repo.countOrders).toHaveBeenCalledWith("a@b.com", "paid");
    expect(repo.listOrders).toHaveBeenCalledWith("a@b.com", "paid", 10, 20);
    expect(result).toMatchObject({ total: 0, page: 3, limit: 10, list: [] });
  });

  it("maps rows with numeric amount and null notice when unbound", async () => {
    const repo = makeRepo([orderRow()], 1);
    const { list } = await listOrderHistory(repo as any, {
      userKey: "a@b.com", status: "", page: 1, limit: 10,
    });
    expect(list[0].amount).toBe(5600);
    expect(list[0].notice).toBeNull();
  });

  it("embeds notice brief with agency fallback to agency_full", async () => {
    const repo = makeRepo([
      orderRow({
        notice_id: 42,
        external_notice_id: "UNGM-1",
        title: "采购水泵",
        agency: "",
        agency_full: "联合国项目事务署",
        country: "中国",
      }),
    ]);
    const { list } = await listOrderHistory(repo as any, {
      userKey: "a@b.com", status: "", page: 1, limit: 10,
    });
    expect(list[0].notice).toMatchObject({
      id: 42,
      notice_id: "UNGM-1",
      title: "采购水泵",
      agency: "联合国项目事务署",
      agency_full: "联合国项目事务署",
    });
  });
});

// ─── listUnlockHistory ──────────────────────────────────────────────────────
describe("listUnlockHistory", () => {
  const unlockRow = (overrides: Record<string, any> = {}) => ({
    user_key: "a@b.com",
    notice_id: 42,
    unlock_type: "paid",
    price: "89",
    unlocked_at: "2026-01-01",
    external_notice_id: "UNGM-1",
    source_channel: "ungm",
    reference: null,
    title: "采购水泵",
    title_i18n: null,
    notice_type: null,
    agency: null,
    agency_full: null,
    country: "中国",
    deadline: null,
    deadline_ts: null,
    urgency: null,
    url: null,
    industry: null,
    description: "水泵描述",
    ...overrides,
  });

  const makeRepo = (rows: any[], total = rows.length) => ({
    countUnlocks: vi.fn().mockResolvedValue(total),
    listUnlocks: vi.fn().mockResolvedValue(rows),
    upsertNoticeTranslation: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    pendingNoticeTranslations.clear();
  });

  it("requests translations for translatable langs and exposes title_i18n", async () => {
    const repo = makeRepo([unlockRow({ title_i18n: "Pompes" })]);
    const { list } = await listUnlockHistory(repo as any, {
      userKey: "a@b.com", lang: "FR", page: 1, limit: 10,
    });
    expect(repo.listUnlocks).toHaveBeenCalledWith("a@b.com", 10, 0, { lang: "fr" });
    expect(list[0].notice?.title_i18n).toBe("Pompes");
  });

  it("omits title_i18n and translation join for non-translatable langs", async () => {
    const repo = makeRepo([unlockRow()]);
    const { list } = await listUnlockHistory(repo as any, {
      userKey: "a@b.com", lang: "de", page: 1, limit: 10,
    });
    expect(repo.listUnlocks).toHaveBeenCalledWith("a@b.com", 10, 0, null);
    expect(list[0].notice?.title_i18n).toBeUndefined();
  });

  it("converts deadline_ts (seconds/millis) into deadline_expired flag", async () => {
    const pastSec = 1_700_000_000; // 秒级历史时间戳
    const futureSec = Math.floor(Date.now() / 1000) + 86_400;
    const repo = makeRepo([
      unlockRow({ notice_id: 1, deadline_ts: pastSec }),
      unlockRow({ notice_id: 2, deadline_ts: futureSec }),
      unlockRow({ notice_id: 3, deadline_ts: null }),
    ]);
    const { list } = await listUnlockHistory(repo as any, {
      userKey: "a@b.com", lang: "", page: 1, limit: 10,
    });
    expect(list[0].notice?.deadline_expired).toBe(true);
    expect(list[1].notice?.deadline_expired).toBe(false);
    expect(list[2].notice?.deadline_expired).toBeNull();
  });

  it("backfills missing translations in the background", async () => {
    vi.mocked(translateNoticeViaChain).mockResolvedValue({
      translations: ["Pompes", "Description FR"],
      provider: "youdao-llm",
    } as any);
    const repo = makeRepo([unlockRow({ title_i18n: null })]);

    await listUnlockHistory(repo as any, {
      userKey: "a@b.com", lang: "fr", page: 1, limit: 10,
    });

    // 后台补翻为 fire-and-forget，等待落库完成
    await vi.waitFor(() => {
      expect(repo.upsertNoticeTranslation).toHaveBeenCalledWith(
        42, "fr", "Pompes", "Description FR", "youdao-llm"
      );
    });
    expect(translateNoticeViaChain).toHaveBeenCalledWith("采购水泵", "水泵描述", "fr");
    // 完成后 pending 键被清理
    expect(pendingNoticeTranslations.size).toBe(0);
  });

  it("skips backfill when translation already present or title empty", async () => {
    const repo = makeRepo([
      unlockRow({ notice_id: 1, title_i18n: "Déjà traduit" }),
      unlockRow({ notice_id: 2, title: "   " }),
    ]);
    await listUnlockHistory(repo as any, {
      userKey: "a@b.com", lang: "fr", page: 1, limit: 10,
    });
    // 给后台任务一个冲刷窗口
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(translateNoticeViaChain).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent backfills via pending map", async () => {
    let resolveTranslation!: (value: any) => void;
    vi.mocked(translateNoticeViaChain).mockImplementation(
      () => new Promise((resolve) => { resolveTranslation = resolve; })
    );
    const repo = makeRepo([unlockRow({ title_i18n: null })]);

    // 两次请求同一 notice:lang，第二次应命中 pending 去重
    void listUnlockHistory(repo as any, { userKey: "a@b.com", lang: "fr", page: 1, limit: 10 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await listUnlockHistory(repo as any, { userKey: "a@b.com", lang: "fr", page: 1, limit: 10 });

    expect(translateNoticeViaChain).toHaveBeenCalledTimes(1);
    resolveTranslation({ translations: ["T", "D"], provider: "p" });
  });

  it("survives translation failures silently", async () => {
    vi.mocked(translateNoticeViaChain).mockRejectedValue(new Error("TRANSLATION_UNAVAILABLE"));
    const repo = makeRepo([unlockRow({ title_i18n: null })]);

    const result = await listUnlockHistory(repo as any, {
      userKey: "a@b.com", lang: "fr", page: 1, limit: 10,
    });
    expect(result.list).toHaveLength(1);
    await vi.waitFor(() => expect(pendingNoticeTranslations.size).toBe(0));
    expect(repo.upsertNoticeTranslation).not.toHaveBeenCalled();
  });
});

// ─── paymentFulfillment ─────────────────────────────────────────────────────
describe("paymentFulfillment", () => {
  it("BILLING_PLANS keeps the fixed price/quota matrix", () => {
    expect(BILLING_PLANS.single).toEqual({ days: null, price: 89, quota: 1 });
    expect(BILLING_PLANS.trial_3).toEqual({ days: null, price: 99, quota: 3 });
    expect(BILLING_PLANS.week_21).toEqual({ days: 7, price: 299, quota: 21 });
    expect(BILLING_PLANS.annual).toEqual({ days: 365, price: 5600, quota: 1095 });
  });

  describe("activateSubscription", () => {
    const makePayments = () => ({
      createSubscription: vi.fn().mockResolvedValue(undefined),
      promoteToVip: vi.fn().mockResolvedValue(undefined),
    });

    it("writes subscription and promotes VIP", async () => {
      const payments = makePayments();
      const result = await activateSubscription(payments as any, {
        userKey: "a@b.com",
        planCode: "week_21",
      });
      expect(payments.createSubscription).toHaveBeenCalledWith("a@b.com", "week_21", 7);
      expect(payments.promoteToVip).toHaveBeenCalledWith("a@b.com");
      expect(result).toEqual({ planCode: "week_21", price: 299, quota: 21 });
    });

    it("falls back to single-plan semantics for unknown codes", async () => {
      const payments = makePayments();
      const result = await activateSubscription(payments as any, {
        userKey: "a@b.com",
        planCode: "ghost_plan",
      });
      expect(payments.createSubscription).toHaveBeenCalledWith("a@b.com", "ghost_plan", null);
      expect(result).toMatchObject({ planCode: "ghost_plan", price: 89, quota: 1 });
    });
  });

  describe("fulfillMockPayment", () => {
    const makePayments = () => ({
      findByOrderNo: vi.fn(),
      markAsMockPaid: vi.fn().mockResolvedValue(undefined),
      insertEntitlement: vi.fn().mockResolvedValue(undefined),
      createSubscription: vi.fn().mockResolvedValue(undefined),
      promoteToVip: vi.fn().mockResolvedValue(undefined),
      upsertNoticeInterest: vi.fn().mockResolvedValue(undefined),
    });
    const makeMembership = (plan: any = { unlock_quota: 1095, duration_days: 365, plan_type: "subscription" }) => ({
      findPlanByCodeForFulfillment: vi.fn().mockResolvedValue(plan),
    });

    it("returns found:false when order missing", async () => {
      const payments = makePayments();
      payments.findByOrderNo.mockResolvedValue(null);
      await expect(
        fulfillMockPayment(payments as any, makeMembership() as any, { orderNo: "NOPE", rawNotify: "{}" })
      ).resolves.toEqual({ found: false });
    });

    it("is idempotent for already-paid orders", async () => {
      const payments = makePayments();
      payments.findByOrderNo.mockResolvedValue({
        order_no: "SO1", user_key: "a@b.com", plan_code: "annual", status: "paid", notice_id: null,
      });
      await expect(
        fulfillMockPayment(payments as any, makeMembership() as any, { orderNo: "SO1", rawNotify: "{}" })
      ).resolves.toEqual({ found: true });
      expect(payments.markAsMockPaid).not.toHaveBeenCalled();
      expect(payments.insertEntitlement).not.toHaveBeenCalled();
    });

    it("fulfills subscription orders: mock-paid + entitlement + subscription + VIP", async () => {
      const payments = makePayments();
      payments.findByOrderNo.mockResolvedValue({
        order_no: "SO1", user_key: "a@b.com", plan_code: "annual", status: "pending", notice_id: null,
      });
      await fulfillMockPayment(payments as any, makeMembership() as any, {
        orderNo: "SO1", rawNotify: '{"via":"mock"}',
      });

      expect(payments.markAsMockPaid).toHaveBeenCalledWith("SO1", '{"via":"mock"}');
      expect(payments.insertEntitlement).toHaveBeenCalledWith({
        userKey: "a@b.com",
        orderNo: "SO1",
        planCode: "annual",
        quotaTotal: 1095,
        durationDays: 365,
      });
      expect(payments.createSubscription).toHaveBeenCalledWith("a@b.com", "annual", 365);
      expect(payments.promoteToVip).toHaveBeenCalledWith("a@b.com");
      expect(payments.upsertNoticeInterest).not.toHaveBeenCalled();
    });

    it("skips subscription/VIP for single plans but records notice interest", async () => {
      const payments = makePayments();
      payments.findByOrderNo.mockResolvedValue({
        order_no: "SO1", user_key: "a@b.com", plan_code: "single", status: "pending", notice_id: 42,
      });
      const membership = makeMembership({ unlock_quota: null, duration_days: null, plan_type: "single" });

      await fulfillMockPayment(payments as any, membership as any, { orderNo: "SO1", rawNotify: "{}" });

      expect(payments.insertEntitlement).toHaveBeenCalledWith({
        userKey: "a@b.com",
        orderNo: "SO1",
        planCode: "single",
        quotaTotal: 1, // quota 缺省保底 1
        durationDays: null,
      });
      expect(payments.createSubscription).not.toHaveBeenCalled();
      expect(payments.promoteToVip).not.toHaveBeenCalled();
      expect(payments.upsertNoticeInterest).toHaveBeenCalledWith("a@b.com", 42);
    });
  });

  describe("createLegacyOrder", () => {
    it("returns null when plan not found", async () => {
      const payments = { createOrder: vi.fn() };
      const membership = { findPlanByCode: vi.fn().mockResolvedValue(null) };
      await expect(
        createLegacyOrder(payments as any, membership as any, {
          userKey: "a@b.com", provider: "mock", planCode: "ghost",
          noticeId: null, orderNo: "SO1", payUrl: "/pay", rawRequest: "{}",
        })
      ).resolves.toBeNull();
      expect(payments.createOrder).not.toHaveBeenCalled();
    });

    it("creates pending order with plan price and currency", async () => {
      const payments = { createOrder: vi.fn().mockResolvedValue(undefined) };
      const membership = {
        findPlanByCode: vi.fn().mockResolvedValue({
          plan_code: "annual", name: "年度会员", price: "5600", currency: "", plan_type: "subscription",
        }),
      };
      const result = await createLegacyOrder(payments as any, membership as any, {
        userKey: "a@b.com", provider: "mock", planCode: "annual",
        noticeId: null, orderNo: "SO1", payUrl: "/pay", rawRequest: "{}",
      });
      expect(result).toEqual({ planName: "年度会员", amount: 5600, currency: "CNY" });
      expect(payments.createOrder).toHaveBeenCalledWith(expect.objectContaining({
        userKey: "a@b.com",
        orderNo: "SO1",
        amount: 5600,
        currency: "CNY",
        qrCodeUrl: null,
      }));
    });
  });
});
