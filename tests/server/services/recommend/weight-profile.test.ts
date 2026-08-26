/**
 * server/services/recommend/weight-profile.ts 测试
 * 验证推荐权重档案重算逻辑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { recomputeRecoWeightProfile } from "../../../../server/services/recommend/weight-profile";

describe("recomputeRecoWeightProfile", () => {
  it("无反馈记录 → 不写入（不建档案）", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn(),
    };
    await recomputeRecoWeightProfile(pool, "user-no-feedback");
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("全正反馈（favorite）→ w_unspsc 上调", async () => {
    const rows = Array(10).fill({ action: "favorite" });
    const pool = {
      query: vi.fn().mockResolvedValue([rows]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(pool, "user-positive");
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO crm_reco_weight_profile");
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    // w_unspsc 应 > 0.5（正反馈上调）
    const wUnspsc = parseFloat(params[1]);
    expect(wUnspsc).toBeGreaterThan(0.5);
  });

  it("全负反馈（dismiss）→ w_unspsc 下调", async () => {
    const rows = Array(10).fill({ action: "dismiss" });
    const pool = {
      query: vi.fn().mockResolvedValue([rows]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(pool, "user-negative");
    const [, params] = pool.execute.mock.calls[0];
    const wUnspsc = parseFloat(params[1]);
    expect(wUnspsc).toBeLessThan(0.5);
  });

  it("click 信号 = 0.75（介于正负之间）", async () => {
    const rows = Array(20).fill({ action: "click" });
    const pool = {
      query: vi.fn().mockResolvedValue([rows]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(pool, "user-click");
    const [, params] = pool.execute.mock.calls[0];
    const wUnspsc = parseFloat(params[1]);
    // click 信号 0.75 → EMA 趋向 0.75 → delta > 0 但 < 全 favorite
    expect(wUnspsc).toBeGreaterThan(0.5);
    expect(wUnspsc).toBeLessThanOrEqual(0.6);
  });

  it("五权重总和恒为 1.000", async () => {
    const rows = Array(5).fill({ action: "favorite" }).concat(Array(5).fill({ action: "dismiss" }));
    const pool = {
      query: vi.fn().mockResolvedValue([rows]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(pool, "user-mixed");
    const [, params] = pool.execute.mock.calls[0];
    const weights = params.slice(1, 6).map(Number);
    const sum = weights.reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("并发保护：同一用户第二次调用被跳过", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn(),
    };
    // 第一次调用
    const p1 = recomputeRecoWeightProfile(pool, "user-concurrent");
    // 第二次调用（第一次还没完成）应被跳过
    await recomputeRecoWeightProfile(pool, "user-concurrent");
    // query 只被调用一次（第二次被并发保护拦截）
    expect(pool.query).toHaveBeenCalledTimes(1);
    await p1;
  });

  it("delta 限制在 [-0.1, +0.1] 范围内", async () => {
    // 极端全正反馈
    const rows = Array(200).fill({ action: "unlock" });
    const pool = {
      query: vi.fn().mockResolvedValue([rows]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(pool, "user-extreme");
    const [, params] = pool.execute.mock.calls[0];
    const wUnspsc = parseFloat(params[1]);
    // w_unspsc ∈ [0.4, 0.6]
    expect(wUnspsc).toBeGreaterThanOrEqual(0.4);
    expect(wUnspsc).toBeLessThanOrEqual(0.6);
  });
});
