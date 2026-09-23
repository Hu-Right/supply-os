/**
 * 解锁配额共享口径固化测试（unlock-quota · 权益体系新账本）
 *
 * 该模块是公告解锁与商机解锁的唯一记账口径，记账源 = crm_benefit_quotas 的
 * notice_view 池行。固化以下语义，任何修改必须同步两条解锁链路与本测试：
 * 1. 池的额度只从矩阵格 value_num 取，代码里不出现任何额度数字；
 * 2. 缺格 / value_num 为 NULL / 额度为 0 → PAID_QUOTA_REQUIRED，且**不开池**
 *    （free.notice_view=0 是 migration 058 的裁决结果，属"零额度"而非"未配置"）；
 * 3. 池不存在时才按矩阵值开一次（幂等抬额），已存在绝不重复开——否则等于把
 *    "已用量"与"应发量"两本账搅在一起；
 * 4. 池记在订阅主账号名下：席位成员消耗同一份额度；
 * 5. 扣减由 consumeLockedPool 的 affectedRows 复核裁决，denied 即抛。
 */
import { describe, it, expect, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { ActivePlanRow } from "@/types/membership";
import type { BenefitWriteRepo, LockedPoolRow } from "@/lib/repos/benefit-write.repo";
import { ensureConsumableQuota, consumeQuota, UnlockQuotaError } from "@/lib/services/unlock-quota";

const conn = {} as PoolConnection;

const pool = (over: Partial<LockedPoolRow> = {}): LockedPoolRow =>
  ({
    id: 900,
    subscription_id: 55,
    seat_user_id: 101,
    benefit_code: "notice_view",
    quota_total: 10,
    quota_used: 0,
    status: "active",
    ...over,
  }) as LockedPoolRow;

function makeDeps(opts: {
  active?: ActivePlanRow | null;
  /** 直接给矩阵格：[]=缺格；[{value_num:null}]=配了行没值；[{value_num:0}]=零额度 */
  matrixCells?: Array<{ benefit_code: string; value_num: number | null }>;
  /** findAndLockCurrentPool 依次返回的结果（缺省一律 null） */
  pools?: Array<LockedPoolRow | null>;
  consume?: "consumed" | "denied" | "unlimited";
} = {}) {
  const cells = opts.matrixCells ?? [{ benefit_code: "notice_view", value_num: 10 }];
  const queue = [...(opts.pools ?? [])];
  const catalog = {
    findActivePlanForUser: vi.fn(async () => opts.active ?? null),
    loadCells: vi.fn(async () => cells),
  } as unknown as BenefitSystemRepo;
  const write = {
    findAndLockCurrentPool: vi.fn(async () => queue.shift() ?? null),
    openQuotaPool: vi.fn(async () => undefined),
    consumeLockedPool: vi.fn(async () => opts.consume ?? "consumed"),
  } as unknown as BenefitWriteRepo;
  return { deps: { catalog, write }, catalog, write };
}

const starter = { subscription_id: 55, owner_user_id: 101, plan_code: "starter" } as unknown as ActivePlanRow;

describe("ensureConsumableQuota · 额度只从矩阵取", () => {
  it("已订阅 starter 且无池：按矩阵 value_num=10 开池后再锁，开池参数落在本订阅与主账号", async () => {
    const { deps, write } = makeDeps({ active: starter, pools: [null, pool()] });
    const got = await ensureConsumableQuota(conn, deps, { userId: 101 });

    expect(write.openQuotaPool).toHaveBeenCalledWith(conn, {
      subscriptionId: 55, seatUserId: 101, benefitCode: "notice_view", quotaTotal: 10,
    });
    expect(got.id).toBe(900);
    // 锁定查的是矩阵档位对应的订阅与主账号，不是"当前登录用户自己的订阅"
    expect(write.findAndLockCurrentPool).toHaveBeenLastCalledWith(conn, {
      seatUserId: 101, benefitCode: "notice_view", subscriptionId: 55,
    });
  });

  it("池已存在：绝不再开池（重复 openQuotaPool 会抬额并洗掉耗尽语义）", async () => {
    const { deps, write } = makeDeps({ active: starter, pools: [pool()] });
    await ensureConsumableQuota(conn, deps, { userId: 101 });
    expect(write.openQuotaPool).not.toHaveBeenCalled();
  });

  it("席位成员消耗主账号同一份池：seat_user_id 取 owner_user_id，subscription_id 取所属订阅", async () => {
    const seatOfOther = {
      subscription_id: 77, owner_user_id: 9, plan_code: "business",
    } as unknown as ActivePlanRow;
    const { deps, write } = makeDeps({ active: seatOfOther, matrixCells: [{ benefit_code: "notice_view", value_num: -1 }], pools: [pool({ subscription_id: 77, seat_user_id: 9 })] });
    await ensureConsumableQuota(conn, deps, { userId: 101 });
    expect(write.findAndLockCurrentPool).toHaveBeenLastCalledWith(conn, {
      seatUserId: 9, benefitCode: "notice_view", subscriptionId: 77,
    });
  });

  it("不限档（value_num=-1）：照常开池，额度原样写 -1 不做换算", async () => {
    const unlimited = { subscription_id: 66, owner_user_id: 101, plan_code: "unlimited" } as unknown as ActivePlanRow;
    const { deps, write } = makeDeps({
      active: unlimited,
      matrixCells: [{ benefit_code: "notice_view", value_num: -1 }],
      pools: [null, pool({ quota_total: -1 })],
    });
    const got = await ensureConsumableQuota(conn, deps, { userId: 101 });
    expect(write.openQuotaPool).toHaveBeenCalledWith(conn, expect.objectContaining({ quotaTotal: -1 }));
    expect(got.quota_total).toBe(-1);
  });
});

describe("ensureConsumableQuota · 无额度必须拒绝", () => {
  it("未订阅按 free 档：free.notice_view=0（migration 058 裁决的零额度）→ 拒绝且不开池", async () => {
    const { deps, write } = makeDeps({ active: null, matrixCells: [{ benefit_code: "notice_view", value_num: 0 }] });
    await expect(ensureConsumableQuota(conn, deps, { userId: 101 })).rejects.toThrow(UnlockQuotaError);
    expect(write.openQuotaPool).not.toHaveBeenCalled();
    expect(write.findAndLockCurrentPool).not.toHaveBeenCalled();
    // 未订阅读的确实是 free 那一列
    expect(deps.catalog.loadCells).toHaveBeenCalledWith(["free"]);
  });

  it("矩阵缺格（该档没声明 notice_view）→ 拒绝，不猜默认额度", async () => {
    const { deps, write } = makeDeps({ active: starter, matrixCells: [] });
    await expect(ensureConsumableQuota(conn, deps, { userId: 101 })).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(write.openQuotaPool).not.toHaveBeenCalled();
  });

  it("value_num 为 NULL（配置了行却没额度值）→ 拒绝，不当成 0 也不当成不限", async () => {
    const { deps } = makeDeps({ active: starter, matrixCells: [{ benefit_code: "notice_view", value_num: null }] });
    await expect(ensureConsumableQuota(conn, deps, { userId: 101 })).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });

  it("开池后仍锁不到池行 → 拒绝（不放行无池消费）", async () => {
    const { deps } = makeDeps({ active: starter, pools: [null, null] });
    await expect(ensureConsumableQuota(conn, deps, { userId: 101 })).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });
});

describe("consumeQuota · 扣减结果决定放行与否", () => {
  it("consumed：正常扣减", async () => {
    const { deps, write } = makeDeps({ consume: "consumed" });
    await expect(consumeQuota(conn, deps, pool())).resolves.toBeUndefined();
    expect(write.consumeLockedPool).toHaveBeenCalledWith(conn, expect.objectContaining({ id: 900 }));
  });

  it("unlimited（-1 池不写行）：不视为失败", async () => {
    const { deps } = makeDeps({ consume: "unlimited" });
    await expect(consumeQuota(conn, deps, pool({ quota_total: -1 }))).resolves.toBeUndefined();
  });

  it("denied（并发耗尽或池被冻结）→ PAID_QUOTA_REQUIRED，由调用方回滚", async () => {
    const { deps } = makeDeps({ consume: "denied" });
    await expect(consumeQuota(conn, deps, pool({ status: "exhausted" }))).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });
});
