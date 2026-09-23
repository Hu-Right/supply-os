/**
 * PaymentService.queryOrder / createOrder(upgrade) / initDefault 分支覆盖（架构评估 P0-T1 续）
 *
 * 钱路核心分支：
 * - queryOrder：订单不存在 → closed；pending 主动轮询渠道状态并同步履约；
 *   轮询异常保持 DB 状态（渠道不可用不误判）
 * - createOrder upgrade：升级资格校验（无套餐/同套餐/降级/差价 0）与差价快照（审查 F23）
 * - return_url 白名单（审查 F26）：外域丢弃，仅同源相对路径回填订单参数
 * - initDefault：仅创建实例不注册策略（ARCH-PN 注册收归 Orchestrator，见 db/context.ts）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentsRepo } from "@/lib/repos/payments.repo";
import type { MembershipRepo } from "@/lib/repos/membership.repo";
import type { CreateOrderRequest } from "@/lib/types/payment";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payment/reverse", () => ({ reverseFulfilledOrder: vi.fn() }));
vi.mock("@/lib/payment/fulfillment", () => ({ activatePaidOrder: vi.fn() }));
vi.mock("@/lib/payment/mock", () => ({ fulfillMockPayment: vi.fn() }));

import { activatePaidOrder } from "@/lib/payment/fulfillment";
import { fulfillMockPayment } from "@/lib/payment/mock";
import { PaymentService } from "@/lib/payment/PaymentService";

const dbOrder = (over: Record<string, unknown> = {}) => ({
  order_no: "SO1",
  status: "pending",
  provider: "mock",
  plan_code: "annual_799",
  amount: 799,
  currency: "CNY",
  notice_id: 5,
  provider_trade_no: null,
  paid_at: null,
  ...over,
});

function makeRepo(order: Record<string, unknown> | null) {
  return {
    findByOrderNo: vi.fn().mockResolvedValue(order),
    findActivePlan: vi.fn().mockResolvedValue({
      plan_code: "annual_8800", name: "标讯企业会员-基础版", price: 8800, currency: "CNY",
    }),
    hasSingleUnlockRecord: vi.fn().mockResolvedValue(false),
    findDeductibleSingleOrder: vi.fn().mockResolvedValue(null),
    findPendingOrder: vi.fn().mockResolvedValue(null),
    createOrder: vi.fn(async (args: { orderNo: string }) => args.orderNo),
    updatePendingOrder: vi.fn(),
    findOrderAmount: vi.fn().mockResolvedValue(null),
  } as unknown as PaymentsRepo;
}

function makeMembershipRepo(current: Record<string, unknown> | null) {
  return {
    findCurrentBestPlan: vi.fn().mockResolvedValue(current),
  } as unknown as MembershipRepo;
}

async function getService(repo: PaymentsRepo, opts?: { membershipRepo?: MembershipRepo; queryStatus?: Record<string, unknown> }) {
  const svc = new PaymentService(repo, opts?.membershipRepo);
  const _s = {
    createPaymentUrl: async () => ({ pay_url: "/pay", qr_code_url: "x" }),
    queryOrderStatus: vi.fn().mockResolvedValue(opts?.queryStatus ?? { order_no: "", status: "pending" }),
    verifyCallback: vi.fn(),
  } as never;
  svc.setStrategyResolver({ getStrategy: () => _s, hasStrategy: () => true });
  return svc;
}

const upgradeReq: CreateOrderRequest = {
  user_id: 7,
  plan_code: "annual_8800",
  provider: "mock",
  order_type: "upgrade",
};

describe("PaymentService.queryOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("订单不存在 → closed", async () => {
    const svc = await getService(makeRepo(null));
    expect(await svc.queryOrder("SOX")).toMatchObject({ order_no: "SOX", status: "closed" });
  });

  it("pending + 渠道轮询返回 paid → 主动履约并返回渠道结果快照", async () => {
    const repo = makeRepo(dbOrder());
    const svc = await getService(repo, {
      queryStatus: { order_no: "SO1", status: "paid", provider_trade_no: "T9" },
    });
    const result = await svc.queryOrder("SO1");
    // 双轨依赖未注入 → 第 4 参透传 undefined，旧履约链行为不变
    expect(activatePaidOrder).toHaveBeenCalledWith(repo, "SO1", "T9", undefined);
    expect(result).toMatchObject({ status: "paid", plan_code: "annual_799", amount: 799 });
  });

  it("pending + 渠道判定失败（非 paid 非 pending）→ 透传渠道结果，不履约", async () => {
    const svc = await getService(makeRepo(dbOrder()), {
      queryStatus: { order_no: "SO1", status: "failed" },
    });
    const result = await svc.queryOrder("SO1");
    expect(activatePaidOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed" });
  });

  it("pending + 渠道仍 pending → 返回 DB 快照", async () => {
    const svc = await getService(makeRepo(dbOrder()), {
      queryStatus: { order_no: "SO1", status: "pending" },
    });
    expect(await svc.queryOrder("SO1")).toMatchObject({ status: "pending", provider: "mock" });
  });

  it("pending + 渠道未注册/轮询抛错 → 捕获后保持 DB 状态（不误判）", async () => {
    const repo = makeRepo(dbOrder({ provider: "alipay" })); // 未注册 alipay → getStrategy 抛错
    const svc = await getService(repo);
    const result = await svc.queryOrder("SO1");
    expect(result.status).toBe("pending");
    expect(activatePaidOrder).not.toHaveBeenCalled();
  });

  it("已支付订单（非 pending）→ 直接返回 DB 快照，paid_at 转 ISO", async () => {
    const paidAt = new Date("2026-09-03T08:00:00Z");
    const svc = await getService(makeRepo(dbOrder({ status: "paid", provider_trade_no: "T1", paid_at: paidAt })));
    const result = await svc.queryOrder("SO1");
    expect(result).toMatchObject({ status: "paid", provider_trade_no: "T1" });
    expect(result.paid_at).toBe(paidAt.toISOString());
  });
});

describe("PaymentService.createOrder — upgrade 分支", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("合法升级 → 差价下单并携带 upgrade_snapshot 与原订单号", async () => {
    const repo = makeRepo(null);
    const membership = makeMembershipRepo({
      plan_code: "annual_799", price: 799, source_order_no: "SO-SRC",
    });
    const svc = await getService(repo, { membershipRepo: membership });
    const order = await svc.createOrder(upgradeReq);
    expect(order.amount).toBe(8800 - 799);
    const args = vi.mocked(repo.createOrder).mock.calls[0][0] as Record<string, unknown>;
    expect(args.orderType).toBe("upgrade");
    expect(args.originalOrderNo).toBe("SO-SRC");
    const raw = JSON.parse(String(args.rawRequest));
    expect(raw.upgrade_snapshot).toEqual({
      target_plan_code: "annual_8800",
      target_price: 8800,
      current_plan_code: "annual_799",
      current_price: 799,
    });
  });

  it("未传 membershipRepo → UPGRADE_NOT_SUPPORTED", async () => {
    const svc = await getService(makeRepo(null));
    await expect(svc.createOrder(upgradeReq)).rejects.toThrow("UPGRADE_NOT_SUPPORTED");
  });

  it("无当前生效套餐 → NO_ACTIVE_PLAN_TO_UPGRADE", async () => {
    const svc = await getService(makeRepo(null), { membershipRepo: makeMembershipRepo(null) });
    await expect(svc.createOrder(upgradeReq)).rejects.toThrow("NO_ACTIVE_PLAN_TO_UPGRADE");
  });

  it("目标与当前同套餐 → ALREADY_ON_TARGET_PLAN", async () => {
    const membership = makeMembershipRepo({ plan_code: "annual_8800", price: 8800 });
    const svc = await getService(makeRepo(null), { membershipRepo: membership });
    await expect(svc.createOrder(upgradeReq)).rejects.toThrow("ALREADY_ON_TARGET_PLAN");
  });

  it("目标价低于当前 → CANNOT_DOWNGRADE（升级不允许降级）", async () => {
    const membership = makeMembershipRepo({ plan_code: "annual_799", price: 9999, source_order_no: "SO-SRC" });
    const svc = await getService(makeRepo(null), { membershipRepo: membership });
    await expect(svc.createOrder(upgradeReq)).rejects.toThrow("CANNOT_DOWNGRADE");
  });
});

describe("PaymentService — return_url 白名单与渠道注册", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("外域 return_url → 丢弃（pay_url 侧不携带订单参数），下单仍成功", async () => {
    const repo = makeRepo(null);
    let receivedReturnUrl = "";
    const svc = new PaymentService(repo);
    const _s2 = {
      createPaymentUrl: vi.fn(async (_no: string, _a: number, _n: string, returnUrl: string) => {
        receivedReturnUrl = returnUrl;
        return { pay_url: "/pay", qr_code_url: "x" };
      }),
      queryOrderStatus: async () => ({ order_no: "", status: "pending" }),
    } as never;
    svc.setStrategyResolver({ getStrategy: () => _s2, hasStrategy: () => true });
    await svc.createOrder({ user_id: 1, plan_code: "vip_m", provider: "mock", return_url: "https://evil.example/phish" });
    expect(receivedReturnUrl).not.toContain("order_no");
  });

  it("同源 return_url 带 hash → 订单参数插入 # 之前", async () => {
    const repo = makeRepo(null);
    let receivedReturnUrl = "";
    const svc = new PaymentService(repo);
    const _s3 = {
      createPaymentUrl: vi.fn(async (_no: string, _a: number, _n: string, returnUrl: string) => {
        receivedReturnUrl = returnUrl;
        return { pay_url: "/pay", qr_code_url: "x" };
      }),
      queryOrderStatus: async () => ({ order_no: "", status: "pending" }),
    } as never;
    svc.setStrategyResolver({ getStrategy: () => _s3, hasStrategy: () => true });
    // SITE_URL 同源绝对地址 → 规范化为相对路径后追加参数
    await svc.createOrder({ user_id: 1, plan_code: "vip_m", provider: "mock", return_url: "/pay#sec" });
    expect(receivedReturnUrl).toMatch(/^\/pay\?order_no=SO\d+.*#sec$/);
  });

  it("initDefault 仅创建实例不注册策略（ARCH-PN：注册收归 Orchestrator）", () => {
    // ARCH-PN（2026-09-11）后 initDefault 不再注册任何渠道，mock/live 行为一致；
    // 渠道注册接线移至 db/context.ts 组合根，占位符密钥拦截由 keys.isParseablePrivateKey
    // 承担（见 keys.test.ts），此处仅锁定「不注册、无副作用」的新契约。
    const svcMock = PaymentService.initDefault(makeRepo(null), "mock");
    const svcLive = PaymentService.initDefault(makeRepo(null), "live");
    expect(svcMock.hasStrategy("mock")).toBe(false);
    expect(svcLive.hasStrategy("mock")).toBe(false);
    expect(svcLive.hasStrategy("alipay")).toBe(false);
    expect(svcLive.hasStrategy("wechat")).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("fulfillMockMembershipOrder：repo 齐备且 mock 履约命中 → true；缺 membershipRepo → false", async () => {
    vi.mocked(fulfillMockPayment).mockResolvedValue({ found: true });
    const svc = new PaymentService(makeRepo(null), makeMembershipRepo({ plan_code: "vip_m" }));
    expect(await svc.fulfillMockMembershipOrder("SO1", "raw")).toBe(true);
    expect(fulfillMockPayment).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), { orderNo: "SO1", rawNotify: "raw" }, undefined,
    );

    const bare = new PaymentService(makeRepo(null));
    expect(await bare.fulfillMockMembershipOrder("SO1", "raw")).toBe(false);
  });
});
