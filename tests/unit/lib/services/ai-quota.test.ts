/**
 * AI 计量消费单测（ai-quota · ai_summary_quota / ai_match_quota 月度次数池）
 *
 * 固化四条口径：
 * 1. 矩阵缺行/缺格/NULL（迁移前旧库无这两个码）→ 不计量，零副作用放行（新旧数据两边正确）；
 * 2. -1 → 明确不限；0 → 该档明确零额度，拒绝且不碰池；
 * 3. 有限额度 → 独立短事务内 ensure+consume，提交后放行；
 * 4. 池耗尽/冻结（UnlockQuotaError）→ 翻译为 AiQuotaExceededError 并回滚事务。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { BenefitWriteRepo, LockedPoolRow } from "@/lib/repos/benefit-write.repo";
import { consumeAiActionQuota, AiQuotaExceededError } from "@/lib/services/ai-quota";

function makeConn() {
  const calls = { committed: 0, rolledBack: 0, released: 0 };
  const conn = {
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => { calls.committed += 1; }),
    rollback: vi.fn(async () => { calls.rolledBack += 1; }),
    release: vi.fn(() => { calls.released += 1; }),
  };
  return { conn: conn as unknown as PoolConnection, ops: conn, calls };
}

function makeDeps(opts: {
  /** 矩阵格：缺省=有 30 额度；[]=缺格（旧库）；value_num=null/0/-1 各有专用用例 */
  cells?: Array<{ benefit_code: string; value_num: number | null }>;
  /** findAndLockCurrentPool 依次返回（缺省=现成 active 池） */
  pools?: Array<LockedPoolRow | null>;
  consume?: "consumed" | "denied" | "unlimited";
} = {}) {
  const cells = opts.cells ?? [{ benefit_code: "ai_summary_quota", value_num: 30 }];
  const queue = [...(opts.pools ?? [])];
  const locked: LockedPoolRow = {
    id: 7, subscription_id: 55, user_id: 101, benefit_code: "ai_summary_quota",
    quota_total: 30, quota_used: 0, status: "active", period_starts_at: new Date(),
  };
  const catalog = {
    findActivePlanForUser: vi.fn(async () => ({ subscription_id: 55, owner_user_id: 101, plan_code: "personal_m" })),
    loadCells: vi.fn(async () => cells),
  } as unknown as BenefitSystemRepo;
  const write = {
    findAndLockCurrentPool: vi.fn(async () => queue.shift() ?? locked),
    openQuotaPool: vi.fn(async () => undefined),
    consumeLockedPool: vi.fn(async () => opts.consume ?? "consumed"),
  } as unknown as BenefitWriteRepo;
  return { deps: { catalog, write }, catalog, write };
}

function makePool(conn: PoolConnection) {
  return { getConnection: vi.fn(async () => conn) } as unknown as Pool;
}

const params = { userId: 101, benefitCode: "ai_summary_quota" };

describe("consumeAiActionQuota · 计量判定", () => {
  it("矩阵缺格（迁移前旧库无此码）→ 不计量，零副作用放行", async () => {
    const { conn } = makeConn();
    const { deps, write } = makeDeps({ cells: [] });
    await expect(consumeAiActionQuota(makePool(conn), deps, params)).resolves.toBeUndefined();
    expect(write.findAndLockCurrentPool).not.toHaveBeenCalled();
    expect(write.consumeLockedPool).not.toHaveBeenCalled();
  });

  it("-1 不限 → 不计量放行，不开池不扣减", async () => {
    const { conn } = makeConn();
    const { deps, write } = makeDeps({ cells: [{ benefit_code: "ai_summary_quota", value_num: -1 }] });
    await expect(consumeAiActionQuota(makePool(conn), deps, params)).resolves.toBeUndefined();
    expect(write.consumeLockedPool).not.toHaveBeenCalled();
  });

  it("0 = 该档明确零额度 → 拒绝且不碰池", async () => {
    const { conn, ops } = makeConn();
    const { deps, write } = makeDeps({ cells: [{ benefit_code: "ai_summary_quota", value_num: 0 }] });
    await expect(consumeAiActionQuota(makePool(conn), deps, params)).rejects.toThrow(AiQuotaExceededError);
    expect(write.findAndLockCurrentPool).not.toHaveBeenCalled();
    expect(ops.rollback).not.toHaveBeenCalled(); // 早于开事务，无需回滚
  });

  it("有限额度（30）→ 短事务内扣 1 并提交，连接归还", async () => {
    const { conn, ops, calls } = makeConn();
    const { deps, write } = makeDeps();
    await consumeAiActionQuota(makePool(conn), deps, params);
    expect(write.findAndLockCurrentPool).toHaveBeenCalledWith(conn, { ...params, subscriptionId: 55 });
    expect(write.consumeLockedPool).toHaveBeenCalledWith(conn, expect.objectContaining({ id: 7 }));
    expect(ops.commit).toHaveBeenCalledTimes(1);
    expect(calls.released).toBe(1);
  });

  it("池耗尽/冻结（UnlockQuotaError）→ AiQuotaExceededError + 回滚", async () => {
    const { conn, ops, calls } = makeConn();
    const { deps } = makeDeps({ consume: "denied" });
    await expect(consumeAiActionQuota(makePool(conn), deps, params)).rejects.toThrow(AiQuotaExceededError);
    expect(ops.rollback).toHaveBeenCalledTimes(1);
    expect(ops.commit).not.toHaveBeenCalled();
    expect(calls.released).toBe(1);
  });

  it("ai_match_quota 同一入口同样适用（按 benefit_code 一码一池）", async () => {
    const { conn, ops } = makeConn();
    const { deps, write } = makeDeps({ cells: [{ benefit_code: "ai_match_quota", value_num: 30 }] });
    await consumeAiActionQuota(makePool(conn), deps, { userId: 101, benefitCode: "ai_match_quota" });
    expect(write.findAndLockCurrentPool).toHaveBeenCalledWith(conn, { userId: 101, benefitCode: "ai_match_quota", subscriptionId: 55 });
    expect(ops.commit).toHaveBeenCalledTimes(1);
  });
});
