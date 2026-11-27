/**
 * 计量配额共享口径固化测试（access-quota · 权益体系新账本）
 *
 * 2026-11-27 起本模块是 AI 计量码（ai_summary_quota/ai_match_quota）的唯一
 * 记账口径（notice_view 解锁消耗已随次数体系退役，池由履约统一开立）。
 * 固化以下语义，任何修改必须同步 ai-quota 链路与本测试：
 * 1. 池的额度只从矩阵格 value_num 取，代码里不出现任何额度数字；
 * 2. 缺格 / value_num 为 NULL / 额度为 0 → PAID_QUOTA_REQUIRED，且**不开池**；
 * 3. 月度计量码：代次起点早于本月 → 以本月 1 号开新一代次；同月重入幂等；
 *    非月度码不再代偿开池（懒开池分支已随解锁体系删除），无池即拒绝；
 * 4. 池记在订阅主账号名下（本人订阅；席位体系已退役，2026-09-29）；
 * 5. 扣减由 consumeLockedPool 的 affectedRows 复核裁决，denied 即抛。
 */
import { describe, it, expect, vi } from "vitest";
import type { PoolConnection } from "mysql2/promise";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { ActivePlanRow } from "@/types/membership";
import type { BenefitWriteRepo, LockedPoolRow } from "@/lib/repos/benefit-write.repo";
import { ensureConsumableQuota, consumeQuota, AccessQuotaError } from "@/lib/services/access-quota";

const conn = {} as PoolConnection;

const pool = (over: Partial<LockedPoolRow> = {}): LockedPoolRow =>
  ({
    id: 900,
    subscription_id: 55,
    user_id: 101,
    benefit_code: "ai_summary_quota",
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
  const cells = opts.matrixCells ?? [{ benefit_code: "ai_summary_quota", value_num: 30 }];
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

const personal = { subscription_id: 55, owner_user_id: 101, plan_code: "personal_m" } as unknown as ActivePlanRow;

describe("ensureConsumableQuota · 额度只从矩阵取", () => {
  it("免费档（无生效套餐）：ai_summary_quota=0 → 拒绝且不开池，读的是 free 那一列", async () => {
    const { deps, write } = makeDeps({ active: null, matrixCells: [{ benefit_code: "ai_summary_quota", value_num: 0 }] });
    await expect(
      ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" }),
    ).rejects.toThrow(AccessQuotaError);
    expect(write.openQuotaPool).not.toHaveBeenCalled();
    expect(write.findAndLockCurrentPool).not.toHaveBeenCalled();
    expect(deps.catalog.loadCells).toHaveBeenCalledWith(["free"]);
  });

  it("矩阵缺格（该档没声明该计量码）→ 拒绝，不猜默认额度", async () => {
    const { deps, write } = makeDeps({ active: personal, matrixCells: [] });
    await expect(
      ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" }),
    ).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(write.openQuotaPool).not.toHaveBeenCalled();
  });

  it("value_num 为 NULL（配置了行却没额度值）→ 拒绝，不当成 0 也不当成不限", async () => {
    const { deps } = makeDeps({ active: personal, matrixCells: [{ benefit_code: "ai_summary_quota", value_num: null }] });
    await expect(
      ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" }),
    ).rejects.toThrow("PAID_QUOTA_REQUIRED");
  });

  it("月度码开新代次后仍锁不到池行 → 拒绝（不放行无池消费）", async () => {
    const { deps } = makeDeps({ active: personal, pools: [null, null] });
    await expect(
      ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" }),
    ).rejects.toThrow("PAID_QUOTA_REQUIRED");
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

// ── 月度换代（2026-10-28 新矩阵 ai_summary_quota / ai_match_quota：次/月，日历月重置）──

describe("ensureConsumableQuota · 月度换代池", () => {
  const monthStart = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();
  const quotaCells = [{ benefit_code: "ai_summary_quota", value_num: 30 }];
  const genPool = (period: Date, over: Partial<LockedPoolRow> = {}): LockedPoolRow =>
    pool({ benefit_code: "ai_summary_quota", quota_total: 30, period_starts_at: period, ...over });

  it("上月池（代次起点早于本月）→ 以本月 1 号开新一代次再锁", async () => {
    const lastMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const { deps, write } = makeDeps({
      active: personal,
      matrixCells: quotaCells,
      pools: [genPool(lastMonth), genPool(monthStart)],
    });
    const got = await ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" });

    expect(write.openQuotaPool).toHaveBeenCalledWith(conn, {
      subscriptionId: 55, userId: 101, benefitCode: "ai_summary_quota", quotaTotal: 30, periodStartsAt: monthStart,
    });
    expect(got.period_starts_at).toEqual(monthStart);
  });

  it("本月池已存在（代次起点=本月 1 号）→ 绝不再开池（同月重入幂等）", async () => {
    const { deps, write } = makeDeps({
      active: personal,
      matrixCells: quotaCells,
      pools: [genPool(monthStart)],
    });
    await ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" });
    expect(write.openQuotaPool).not.toHaveBeenCalled();
  });

  it("尚无任何池 → 直接以本月 1 号开首代次（不等订阅 started_at 哨兵）", async () => {
    const { deps, write } = makeDeps({
      active: personal,
      matrixCells: quotaCells,
      pools: [null, genPool(monthStart)],
    });
    await ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "ai_summary_quota" });
    expect(write.openQuotaPool).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({ periodStartsAt: monthStart }),
    );
  });

  it("非月度码（不在换代名单）：已有池原样返回，不代偿开池（懒开池已随解锁体系删除）", async () => {
    const lastMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const legacyCells = [{ benefit_code: "legacy_quota", value_num: 5 }];
    const legacyPool = pool({ benefit_code: "legacy_quota", quota_total: 5, period_starts_at: lastMonth });
    const { deps, write } = makeDeps({
      active: personal,
      matrixCells: legacyCells,
      pools: [legacyPool],
    });
    const got = await ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "legacy_quota" });
    expect(write.openQuotaPool).not.toHaveBeenCalled();
    expect(got.id).toBe(900);
  });

  it("非月度码无池 → 拒绝（不再按订阅期懒开池）", async () => {
    const legacyCells = [{ benefit_code: "legacy_quota", value_num: 5 }];
    const { deps, write } = makeDeps({ active: personal, matrixCells: legacyCells, pools: [null] });
    await expect(
      ensureConsumableQuota(conn, deps, { userId: 101, benefitCode: "legacy_quota" }),
    ).rejects.toThrow("PAID_QUOTA_REQUIRED");
    expect(write.openQuotaPool).not.toHaveBeenCalled();
  });
});
