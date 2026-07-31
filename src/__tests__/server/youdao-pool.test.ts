/**
 * youdaoPool 账号池单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 每次测试前重置模块缓存，让 pool 重新读 env
let pool: typeof import("../../../server/services/translation/youdaoPool");

beforeEach(async () => {
  vi.resetModules();
  // 清理所有有道相关 env
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("YOUDAO_")) delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadPool() {
  pool = await import("../../../server/services/translation/youdaoPool");
  return pool.youdaoPool;
}

describe("youdaoPool", () => {
  it("loads legacy single account from YOUDAO_APP_KEY/SECRET", async () => {
    process.env.YOUDAO_APP_KEY = "legacy-key";
    process.env.YOUDAO_APP_SECRET = "legacy-secret";
    const p = await loadPool();
    expect(p.size).toBe(1);
    const acct = p.getActive();
    expect(acct?.appKey).toBe("legacy-key");
  });

  it("loads numbered accounts and combines with legacy", async () => {
    process.env.YOUDAO_APP_KEY = "legacy-key";
    process.env.YOUDAO_APP_SECRET = "legacy-secret";
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    process.env.YOUDAO_APP_KEY_2 = "key-2";
    process.env.YOUDAO_APP_SECRET_2 = "secret-2";
    const p = await loadPool();
    expect(p.size).toBe(3); // legacy + 2 numbered
  });

  it("skips placeholder values", async () => {
    process.env.YOUDAO_APP_KEY = "MY_YOUDAO_APP_KEY"; // placeholder
    process.env.YOUDAO_APP_SECRET = "MY_YOUDAO_APP_SECRET";
    const p = await loadPool();
    expect(p.size).toBe(0);
    expect(p.getActive()).toBeNull();
  });

  it("rotates to next account on markExhausted", async () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    process.env.YOUDAO_APP_KEY_2 = "key-2";
    process.env.YOUDAO_APP_SECRET_2 = "secret-2";
    const p = await loadPool();

    const first = p.getActive();
    expect(first?.appKey).toBe("key-1");

    p.markExhausted(first!.index);
    const second = p.getActive();
    expect(second?.appKey).toBe("key-2");
  });

  it("returns null when all accounts exhausted", async () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    const p = await loadPool();

    const acct = p.getActive();
    expect(acct).not.toBeNull();
    p.markExhausted(acct!.index);
    expect(p.getActive()).toBeNull();
  });

  it("identifies quota error codes correctly", async () => {
    const p = await loadPool();
    expect(p.isQuotaError("108")).toBe(true);
    expect(p.isQuotaError("109")).toBe(true);
    expect(p.isQuotaError("110")).toBe(true);
    expect(p.isQuotaError("111")).toBe(true);
    expect(p.isQuotaError("902000")).toBe(false);
    expect(p.isQuotaError("202")).toBe(false);
    expect(p.isQuotaError("")).toBe(false);
  });

  it("exhausted account recovers after cooldown expires", async () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    const p = await loadPool();

    const acct = p.getActive();
    p.markExhausted(acct!.index);
    expect(p.getActive()).toBeNull();

    // 模拟冷却到期：将 exhaustedUntil 回拨
    p.overrideCooldownForTest(acct!.index, Date.now() - 1000);
    expect(p.getActive()?.appKey).toBe("key-1");
  });
});
