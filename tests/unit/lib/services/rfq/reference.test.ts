/**
 * RFQ 编号器单测
 * @module tests/unit/lib/services/rfq/reference
 */
import { describe, it, expect } from "vitest";
import {
  demandYear,
  formatDemandReference,
  isDemandReference,
} from "@/lib/services/rfq/reference";

describe("formatDemandReference", () => {
  it("按年 + 6 位补零生成可读编号", () => {
    // 2026-05-01T00:00:00Z
    expect(formatDemandReference(1, 1_777_593_600)).toBe("OSRFQ-2026-000001");
    expect(formatDemandReference(123456, 1_777_593_600)).toBe("OSRFQ-2026-123456");
  });

  it("按 Asia/Shanghai 计年：UTC 跨年前 16 小时仍属次年中国年", () => {
    // 2025-12-31T16:00:00Z = 2026-01-01T00:00:00+08:00
    expect(demandYear(1_767_196_800)).toBe(2026);
    // 2025-12-31T15:00:00Z = 2025-12-31T23:00:00+08:00
    expect(demandYear(1_767_193_200)).toBe(2025);
  });

  it("id 非法时抛错（防止把 0 号编号写进库）", () => {
    expect(() => formatDemandReference(0, 1_777_593_600)).toThrow();
    expect(() => formatDemandReference(-1, 1_777_593_600)).toThrow();
  });
});

describe("isDemandReference", () => {
  it("接受生成形态，拒绝爬虫 RFQ- 前缀与手工串", () => {
    expect(isDemandReference("OSRFQ-2026-000001")).toBe(true);
    expect(isDemandReference("RFQ-CPD-26-012")).toBe(false);
    expect(isDemandReference("OSRFQ-26-1")).toBe(false);
    expect(isDemandReference("")).toBe(false);
  });
});
