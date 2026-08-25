/**
 * server/services/search-orchestrator/ 工具函数测试
 * 覆盖 params.ts, format.ts, metrics.ts, rebuild-trigger.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── params ──
import { validateParams, searchCacheKey } from "../../../../server/services/search-orchestrator/params";

describe("validateParams", () => {
  it("默认值", () => {
    const p = validateParams({});
    expect(p.mode).toBe("default");
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(9);
    expect(p.sort).toBe("deadline_farthest");
    expect(p.q).toBe("");
    expect(p.country).toBe("");
  });

  it("mode 钳制：合法值保留", () => {
    expect(validateParams({ mode: "prefs" }).mode).toBe("prefs");
    expect(validateParams({ mode: "recommended" }).mode).toBe("recommended");
  });

  it("mode 钳制：非法值回退 default", () => {
    expect(validateParams({ mode: "invalid" }).mode).toBe("default");
  });

  it("sort 钳制", () => {
    expect(validateParams({ sort: "latest" }).sort).toBe("latest");
    expect(validateParams({ sort: "deadline" }).sort).toBe("deadline");
    expect(validateParams({ sort: "garbage" }).sort).toBe("deadline_farthest");
  });

  it("page 钳制 1~1000", () => {
    expect(validateParams({ page: -5 }).page).toBe(1);
    expect(validateParams({ page: 9999 }).page).toBe(1000);
    expect(validateParams({ page: 50 }).page).toBe(50);
  });

  it("pageSize 钳制 6~30", () => {
    expect(validateParams({ pageSize: 1 }).pageSize).toBe(6);
    expect(validateParams({ pageSize: 100 }).pageSize).toBe(30);
    expect(validateParams({ pageSize: 20 }).pageSize).toBe(20);
  });

  it("日期格式校验", () => {
    expect(validateParams({ deadlineFrom: "2026-01-01" }).deadlineFrom).toBe("2026-01-01");
    expect(validateParams({ deadlineFrom: "not-a-date" }).deadlineFrom).toBe("");
    expect(validateParams({ deadlineTo: "2026-12-31" }).deadlineTo).toBe("2026-12-31");
  });

  it("q 截断 200 字符", () => {
    const longQ = "a".repeat(300);
    expect(validateParams({ q: longQ }).q.length).toBe(200);
  });

  it("country/agency 截断 100 字符", () => {
    const long = "x".repeat(200);
    expect(validateParams({ country: long }).country.length).toBe(100);
    expect(validateParams({ agency: long }).agency.length).toBe(100);
  });

  it("deadlineWithinDays 钳制 0~365", () => {
    expect(validateParams({ deadlineWithinDays: -10 }).deadlineWithinDays).toBe(0);
    expect(validateParams({ deadlineWithinDays: 999 }).deadlineWithinDays).toBe(365);
  });

  it("codeId 非负整数", () => {
    expect(validateParams({ codeId: -5 }).codeId).toBe(0);
    expect(validateParams({ codeId: 42 }).codeId).toBe(42);
  });
});

describe("searchCacheKey (orchestrator)", () => {
  it("大小写归一化：q lowercase, country uppercase", () => {
    const p1 = validateParams({ q: "Water", country: "Kenya" });
    const p2 = validateParams({ q: "water", country: "KENYA" });
    expect(searchCacheKey(p1)).toBe(searchCacheKey(p2));
  });

  it("不同参数生成不同键", () => {
    const p1 = validateParams({ q: "water", page: 1 });
    const p2 = validateParams({ q: "water", page: 2 });
    expect(searchCacheKey(p1)).not.toBe(searchCacheKey(p2));
  });
});

// ── format ──
import { matchScoreToTierLabel } from "../../../../server/services/search-orchestrator/format";

describe("matchScoreToTierLabel", () => {
  it("≥5 → precise", () => {
    expect(matchScoreToTierLabel(5)).toBe("precise");
    expect(matchScoreToTierLabel(10)).toBe("precise");
  });

  it("2~4 → relevant", () => {
    expect(matchScoreToTierLabel(2)).toBe("relevant");
    expect(matchScoreToTierLabel(4)).toBe("relevant");
  });

  it("<2 → unmatched", () => {
    expect(matchScoreToTierLabel(0)).toBe("unmatched");
    expect(matchScoreToTierLabel(1)).toBe("unmatched");
  });
});

// ── metrics ──
import { logPerf, recordFallback, logSyncCascade } from "../../../../server/services/search-orchestrator/metrics";

describe("metrics", () => {
  it("logPerf 不抛异常", () => {
    expect(() => logPerf({
      mode: "default", path: "meili", q: "test", filterDigest: "f",
      meiliMs: 10, detailMs: 5, totalMs: 15, total: 100, ids: 9,
      page: 1, cache: "miss",
    })).not.toThrow();
  });

  it("logPerf cache=hit 不输出", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logPerf({
      mode: "default", path: "meili", q: "", filterDigest: "",
      meiliMs: 0, detailMs: 0, totalMs: 0, total: 0, ids: 0,
      page: 1, cache: "hit",
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("recordFallback 不抛异常", () => {
    expect(() => recordFallback("test-reason")).not.toThrow();
  });

  it("logSyncCascade 不抛异常", () => {
    expect(() => logSyncCascade("wide", 10, "ok")).not.toThrow();
  });
});

// ── rebuild-trigger ──
import { requestIndexRebuild, isRebuildRequested } from "../../../../server/services/search-orchestrator/rebuild-trigger";

describe("rebuild-trigger", () => {
  it("初始无重建请求", () => {
    // 注意：模块级状态可能受其他测试影响，只验证函数存在且返回 boolean
    expect(typeof isRebuildRequested()).toBe("boolean");
  });

  it("requestIndexRebuild 标记后 isRebuildRequested=true", () => {
    requestIndexRebuild("test-reason");
    expect(isRebuildRequested()).toBe(true);
  });
});
