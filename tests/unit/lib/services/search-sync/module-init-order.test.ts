/**
 * search-sync 模块图初始化顺序守卫（回归：builder ↔ fingerprint 循环依赖）
 *
 * 真实故障：wide-row-builder 用 wide-fingerprint 的 WIDE_FP_EXPR 拼 SELECT，
 * 而 wide-fingerprint 又反向导入 builder 的 JOIN 片段 —— Node ESM 下按入口不同
 * 触发「Cannot access 'WIDE_FP_EXPR' before initialization」，应用启动即崩。
 * 单测只走一种入口顺序会侥幸通过，因此这里两种顺序都跑一次（resetModules 保证互不污染）。
 * 修复方式：JOIN 片段下沉到无依赖叶子模块 wide-sync-sql。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => vi.resetModules());

describe("模块初始化顺序", () => {
  it("以 fingerprint 为入口：builder 的 SELECT 已含指纹且已初始化", async () => {
    const fp = await import("@/lib/services/search-sync/wide-fingerprint");
    const builder = await import("@/lib/services/search-sync/wide-row-builder");
    expect(fp.WIDE_FP_EXPR.startsWith("MD5(")).toBe(true);
    expect(builder.wideSyncSelect(true)).toContain(fp.WIDE_FP_EXPR);
    expect(builder.WIDE_SYNC_JOIN).toContain("crm_bid_opportunities");
  });

  it("以 builder 为入口：指纹表达式同样完整可用", async () => {
    const builder = await import("@/lib/services/search-sync/wide-row-builder");
    const fp = await import("@/lib/services/search-sync/wide-fingerprint");
    expect(builder.wideSyncSelect(true)).toContain(fp.WIDE_FP_EXPR);
    expect(typeof builder.buildWideRow).toBe("function");
    expect(typeof fp.detectWideFingerprintDrift).toBe("function");
  });

  it("对账层入口亦不受影响（其修复走 syncWideIds，不反向依赖内容列写法）", async () => {
    const reconcile = await import("@/lib/services/search-sync/wide-row-reconcile");
    expect(typeof reconcile.detectDeadlineDrift).toBe("function");
    expect(typeof reconcile.detectPlatformStatusDrift).toBe("function");
  });
});
