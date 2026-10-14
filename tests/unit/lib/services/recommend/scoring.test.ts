import { describe, it, expect, vi } from "vitest";
import { buildScoringContext, resolveWeights, getAmountPreference } from "@/lib/services/recommend/scoring";
import type { RecallNode } from "@/lib/services/recommend/recall";

const node = (n: string, weighted: number, precision = 8): RecallNode => ({ node: n, precision, weighted });

describe("buildScoringContext（打分读宽表列值，收窄才读倒排表）", () => {
  it("空 scoredNodes → matchWeightExpr='0'", () => {
    const ctx = buildScoringContext([], 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.matchWeightExpr).toBe("0");
  });

  it("有落点节点 → 拼 MAX(FIND_IN_SET(?, ns.backbone_path))，旧桥表形状一个不许留", () => {
    const ctx = buildScoringContext([node("UGT-01010101", 2.5)], 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.matchWeightExpr).toBe("(MAX(FIND_IN_SET(?, ns.backbone_path)) * ?)");
    expect(ctx.scoreParams).toEqual(["UGT-01010101", 2.5]);
    expect(ctx.matchWeightExpr).not.toMatch(/LIKE|b\.code|level[1-5]_id/);
  });

  it("denominator = interestTotal > 0", () => {
    const ctx = buildScoringContext([], 20, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.denominator).toBe(20);
  });

  it("denominator = 1 当 interestTotal = 0", () => {
    const ctx = buildScoringContext([], 0, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.denominator).toBe(1);
  });

  it("品目级兴趣码（有效位 8）→ 生成 l4 OR 表达式与节点参数", () => {
    const ctx = buildScoringContext(
      [node("UGT-0101010101", 1.0, 8), node("UGT-05", 0.5, 2)],
      10, 0.5, 0.15, 0.1, 0.05, 3, true,
    );
    expect(ctx.l4HitExpr).toContain("FIND_IN_SET(?, ns.backbone_path)");
    expect(ctx.l4Params).toEqual(["UGT-0101010101"]);
    expect(ctx.l4HitExpr).not.toMatch(/LIKE/);
  });

  it("全部粗码（有效位 < 8）→ l4HitExpr 恒为 0", () => {
    const ctx = buildScoringContext([node("UGT-05", 0.5, 2)], 10, 0.5, 0.15, 0.1, 0.05, 3, true);
    expect(ctx.l4HitExpr).toBe("0");
    expect(ctx.l4Params).toEqual([]);
  });

  it("表达式只取权重最高的 24 个落点（实测主查询耗时几乎线性于个数），但分母不缩", () => {
    const many = Array.from({ length: 30 }, (_, i) => node(`UGT-05${String(i).padStart(4, "0")}`, 30 - i));
    const ctx = buildScoringContext(many, 100, 0.5, 0.15, 0.1, 0.05, 3, false);
    expect(ctx.scoreParams).toHaveLength(48); // 24 个节点 × (码, 权重)
    expect(ctx.scoreParams[0]).toBe(many[0].node); // 降序取最强的 24 个
    expect(ctx.denominator).toBe(100); // 归一分母仍是全部兴趣权重之和
  });
});

describe("resolveWeights", () => {
  it("control 变体 → 全局默认", () => {
    const result = resolveWeights({ w_commodity: 0.8 } as any, "control");
    expect(result.wCommodity).toBe(0.5);
  });

  it("treatment + 有效 profile → 使用 profile", () => {
    const row = { w_commodity: 0.6, w_urgency: 0.12, w_amount: 0.08, w_agency: 0.1, w_geo: 0.1, updated_at: new Date() } as any;
    const result = resolveWeights(row, "treatment");
    expect(result.wCommodity).toBe(0.6);
  });

  it("profileStale: 无 profileRow → true", () => {
    expect(resolveWeights(null, "treatment").profileStale).toBe(true);
  });
});

describe("getAmountPreference", () => {
  it("DB 返回有效数据 → centerLog + active", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ center_log: 3.5, cnt: 5 }]]),
    };
    const result = await getAmountPreference(mockPool as any, 1);
    expect(result.centerLog).toBe(3.5);
    expect(result.active).toBe(true);
  });

  it("DB 返回 cnt < 2 → active=false", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ center_log: 0, cnt: 1 }]]),
    };
    const result = await getAmountPreference(mockPool as any, 2);
    expect(result.active).toBe(false);
  });

  it("TTL 内重复查询 → 命中缓存不再触达 DB", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ center_log: 2.5, cnt: 3 }]]),
    };
    await getAmountPreference(mockPool as any, 99);
    await getAmountPreference(mockPool as any, 99);
    await getAmountPreference(mockPool as any, 99);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(await getAmountPreference(mockPool as any, 99)).toEqual({ centerLog: 2.5, active: true });
  });
});
