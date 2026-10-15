import { describe, it, expect, vi } from "vitest";
import { getNoticeStats, clearStatsCache } from "@/lib/services/notice-search/stats";

// 2026-10-15 审计收刀：crm_notice_stats 预计算管线（statsKeyFor/getStatsCount/refreshNoticeStats）
// 已随旧搜索管道退役整体删除（无读取方），本文件只保留活着的 getNoticeStats。
describe("getNoticeStats", () => {
  it("返回统计数据", async () => {
    // 与实现查询序列一致：raw → active → bridged → featured → deadline30 → docs
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ total: 200 }]])  // raw
        .mockResolvedValueOnce([[{ total: 100 }]])  // active
        .mockResolvedValueOnce([[{ total: 50 }]])   // bridged
        .mockResolvedValueOnce([[{ total: 10 }]])   // featured
        .mockResolvedValueOnce([[{ total: 20 }]])   // 未来 30 天截止
        .mockResolvedValueOnce([[{ total: 80 }]]),  // 含原始文件
    };
    const result = await getNoticeStats(mockPool as any);
    expect(result.raw).toBe(200);
    expect(result.active).toBe(100);
    expect(result.bridged).toBe(50);
    expect(result.featured).toBe(10);
    expect(result.bridge_gap).toBe(50);
    expect(result.deadline_in_30d).toBe(20);
    expect(result.with_original_docs).toBe(80);
    clearStatsCache();
  });

  it("10 分钟缓存命中：第二次调用不再查库", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValue([[{ total: 1 }]]),
    };
    clearStatsCache();
    await getNoticeStats(mockPool as any);
    const callsAfterFirst = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls.length;
    await getNoticeStats(mockPool as any);
    expect((mockPool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
    clearStatsCache();
  });

  it("并发请求复用同一次计算（请求级锁）", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const slow = new Promise((resolve) => { resolveFirst = resolve; });
    const mockPool = { query: vi.fn(() => slow) };
    clearStatsCache();
    const p1 = getNoticeStats(mockPool as any);
    const p2 = getNoticeStats(mockPool as any);
    expect(p1).toBe(p2); // 同一个 Promise，不会并发触发两轮 6 查询
    resolveFirst([[{ total: 0 }]]);
    await Promise.all([p1, p2]).catch(() => undefined);
    clearStatsCache();
  });
});
