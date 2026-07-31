/**
 * youdaoPool 账号池单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { youdaoPool } from "../../../server/services/translation/youdaoPool";

beforeEach(() => {
  // 清理所有有道相关 env
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("YOUDAO_")) delete process.env[key];
  }
  // 单例重置：懒加载标记归零，下次访问时按本用例设置的 env 重新加载
  youdaoPool.resetForTest();
  // 抑制池的 console.log/warn 噪音
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("youdaoPool", () => {
  it("loads legacy single account from YOUDAO_APP_KEY/SECRET", () => {
    process.env.YOUDAO_APP_KEY = "legacy-key";
    process.env.YOUDAO_APP_SECRET = "legacy-secret";
    const p = youdaoPool;
    expect(p.size).toBe(1);
    const acct = p.getActive();
    expect(acct?.appKey).toBe("legacy-key");
  });

  it("loads numbered accounts and combines with legacy", () => {
    process.env.YOUDAO_APP_KEY = "legacy-key";
    process.env.YOUDAO_APP_SECRET = "legacy-secret";
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    process.env.YOUDAO_APP_KEY_2 = "key-2";
    process.env.YOUDAO_APP_SECRET_2 = "secret-2";
    const p = youdaoPool;
    expect(p.size).toBe(3); // legacy + 2 numbered
  });

  it("skips placeholder values", () => {
    process.env.YOUDAO_APP_KEY = "MY_YOUDAO_APP_KEY"; // placeholder
    process.env.YOUDAO_APP_SECRET = "MY_YOUDAO_APP_SECRET";
    const p = youdaoPool;
    expect(p.size).toBe(0);
    expect(p.getActive()).toBeNull();
  });

  it("rotates to next account on markExhausted", () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    process.env.YOUDAO_APP_KEY_2 = "key-2";
    process.env.YOUDAO_APP_SECRET_2 = "secret-2";
    const p = youdaoPool;

    const first = p.getActive();
    expect(first?.appKey).toBe("key-1");

    p.markExhausted(first!.index);
    const second = p.getActive();
    expect(second?.appKey).toBe("key-2");
  });

  it("returns null when all accounts exhausted", () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    const p = youdaoPool;

    const acct = p.getActive();
    expect(acct).not.toBeNull();
    p.markExhausted(acct!.index);
    expect(p.getActive()).toBeNull();
  });

  it("identifies quota error codes correctly", () => {
    const p = youdaoPool;
    expect(p.isQuotaError("108")).toBe(true);
    expect(p.isQuotaError("109")).toBe(true);
    expect(p.isQuotaError("110")).toBe(true);
    expect(p.isQuotaError("111")).toBe(true);
    expect(p.isQuotaError("902000")).toBe(false);
    expect(p.isQuotaError("202")).toBe(false);
    expect(p.isQuotaError("")).toBe(false);
  });

  it("exhausted account recovers after cooldown expires", () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    const p = youdaoPool;

    const acct = p.getActive();
    p.markExhausted(acct!.index);
    expect(p.getActive()).toBeNull();

    // 模拟冷却到期：将 exhaustedUntil 回拨
    p.overrideCooldownForTest(acct!.index, Date.now() - 1000);
    expect(p.getActive()?.appKey).toBe("key-1");
  });

  it("wraps around correctly with 3 accounts", () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    process.env.YOUDAO_APP_KEY_2 = "key-2";
    process.env.YOUDAO_APP_SECRET_2 = "secret-2";
    process.env.YOUDAO_APP_KEY_3 = "key-3";
    process.env.YOUDAO_APP_SECRET_3 = "secret-3";
    const p = youdaoPool;
    expect(p.size).toBe(3);

    // 顺序轮转：1 → 2 → 3
    const a1 = p.getActive();
    expect(a1?.appKey).toBe("key-1");
    p.markExhausted(a1!.index);

    const a2 = p.getActive();
    expect(a2?.appKey).toBe("key-2");
    p.markExhausted(a2!.index);

    const a3 = p.getActive();
    expect(a3?.appKey).toBe("key-3");
    p.markExhausted(a3!.index);

    // 全部耗尽
    expect(p.getActive()).toBeNull();

    // 恢复 #1 后重新可用
    p.overrideCooldownForTest(a1!.index, Date.now() - 1000);
    expect(p.getActive()?.appKey).toBe("key-1");
  });

  it("resetForTest clears all state and reloads from env", () => {
    process.env.YOUDAO_APP_KEY_1 = "key-1";
    process.env.YOUDAO_APP_SECRET_1 = "secret-1";
    const p = youdaoPool;
    expect(p.size).toBe(1);

    // 耗尽后 reset
    const acct = p.getActive();
    p.markExhausted(acct!.index);
    expect(p.getActive()).toBeNull();

    // 更换 env 后 reset 应重新加载
    delete process.env.YOUDAO_APP_KEY_1;
    delete process.env.YOUDAO_APP_SECRET_1;
    process.env.YOUDAO_APP_KEY = "new-legacy";
    process.env.YOUDAO_APP_SECRET = "new-secret";
    p.resetForTest();
    expect(p.size).toBe(1);
    expect(p.getActive()?.appKey).toBe("new-legacy");
  });
});
