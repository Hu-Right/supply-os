import { describe, it, expect, vi } from "vitest";
import { logPerf, recordFallback, logSyncCascade } from "./metrics";
import type { PerfLogEntry } from "./metrics";

const baseEntry: PerfLogEntry = {
  mode: "default",
  path: "meili",
  q: "test",
  filterDigest: "abc",
  meiliMs: 50,
  detailMs: 100,
  totalMs: 150,
  total: 100,
  ids: 9,
  page: 1,
  cache: "miss",
};

describe("logPerf", () => {
  it("cache=hit → 不输出", () => {
    const spy = vi.spyOn(console, "log");
    logPerf({ ...baseEntry, cache: "hit" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("cache=miss → 1/10 采样（前 9 次不输出）", () => {
    const spy = vi.spyOn(console, "log");
    for (let i = 0; i < 9; i++) logPerf(baseEntry);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("cache=miss 采样命中（每第 10 次）→ 输出性能日志", () => {
    const spy = vi.spyOn(console, "log");
    // 模块级计数器跨用例累计：此前 9 次，再推 10 次必含采样命中点
    for (let i = 0; i < 10; i++) logPerf(baseEntry);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[search-perf]"));
    spy.mockRestore();
  });
});

describe("recordFallback", () => {
  it("调用时输出 warn", () => {
    const spy = vi.spyOn(console, "warn");
    recordFallback("test_reason");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("1 分钟窗口内累计 10 次 → 触发熔断 ERROR 告警", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // 模块级窗口数组跨用例累计（60s 内不清理），推满阈值
    for (let i = 0; i < 12; i++) recordFallback("circuit_test");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("CIRCUIT_BREAKER"));
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("logSyncCascade", () => {
  it("status=ok → 1/10 采样", () => {
    const spy = vi.spyOn(console, "log");
    for (let i = 0; i < 9; i++) logSyncCascade("wide", 10, "ok");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("status=fail → 始终输出", () => {
    const spy = vi.spyOn(console, "log");
    logSyncCascade("wide", 10, "fail");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("status=retry → 始终输出", () => {
    const spy = vi.spyOn(console, "log");
    logSyncCascade("meili", 5, "retry");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
