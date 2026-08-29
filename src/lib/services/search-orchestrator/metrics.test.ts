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
});

describe("recordFallback", () => {
  it("调用时输出 warn", () => {
    const spy = vi.spyOn(console, "warn");
    recordFallback("test_reason");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
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
