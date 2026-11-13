import { describe, it, expect } from "vitest";
import {
  ACTIVE_NOTICE_WHERE,
  ACTIONABLE_NOTICE_WHERE,
  ACTIVE_OPP_WHERE,
  ACTIVE_NOTICE_WHERE_NO_ALIAS,
  MEILI_ACTIVE_FILTER,
  PIPELINE_EXPIRY_GRACE_SECONDS,
  STABLE_EXPIRED_WHERE,
  STABLE_EXPIRED_WHERE_NO_ALIAS,
  isStablyExpired,
  toBeijingUnixTs,
} from "@/lib/utils/notice-expired";

describe("公告过期常量", () => {
  it("ACTIVE_NOTICE_WHERE 包含 n.deadline_sec", () => {
    expect(ACTIVE_NOTICE_WHERE).toContain("n.deadline_sec");
    expect(ACTIVE_NOTICE_WHERE).toContain("deadline_sec = 0");
    expect(ACTIVE_NOTICE_WHERE).toContain("UNIX_TIMESTAMP(NOW())");
  });

  it("ACTIONABLE_NOTICE_WHERE 只认 known/bid + 12 个月窗口，不再把 0 当可投", () => {
    expect(ACTIONABLE_NOTICE_WHERE).toContain("notice_deadline");
    expect(ACTIONABLE_NOTICE_WHERE).toContain("deadline_state = 'known'");
    expect(ACTIONABLE_NOTICE_WHERE).toContain("deadline_type = 'bid'");
    expect(ACTIONABLE_NOTICE_WHERE).toContain("effective_ts");
    expect(ACTIONABLE_NOTICE_WHERE).not.toContain("deadline_sec = 0");
  });

  it("ACTIVE_OPP_WHERE 使用 o. 别名", () => {
    expect(ACTIVE_OPP_WHERE).toContain("o.deadline_sec");
  });

  it("ACTIVE_NOTICE_WHERE_NO_ALIAS 无表别名", () => {
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).not.toContain("n.");
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).not.toContain("o.");
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).toContain("deadline_sec");
  });

  it("MEILI_ACTIVE_FILTER 使用 {now} 占位符", () => {
    expect(MEILI_ACTIVE_FILTER).toContain("{now}");
    expect(MEILI_ACTIVE_FILTER).toContain("deadline_sec = 0");
  });
});

describe("管线清退口径（稳定过期，2026-11-13 构建时摘除）", () => {
  // 固定「现在」，避免真实时钟漂移影响边界断言
  const NOW = 1_800_000_000;

  it("清退余量为 30 天", () => {
    expect(PIPELINE_EXPIRY_GRACE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("STABLE_EXPIRED_WHERE 有 n. 别名、含余量常量；无别名版不带 n.", () => {
    expect(STABLE_EXPIRED_WHERE).toContain("n.deadline_sec > 0");
    expect(STABLE_EXPIRED_WHERE).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
    expect(STABLE_EXPIRED_WHERE).toContain("UNIX_TIMESTAMP(NOW())");
    expect(STABLE_EXPIRED_WHERE_NO_ALIAS).not.toContain("n.");
    expect(STABLE_EXPIRED_WHERE_NO_ALIAS).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
  });

  it("isStablyExpired：过期超过余量 → true", () => {
    expect(isStablyExpired(NOW - PIPELINE_EXPIRY_GRACE_SECONDS - 1, NOW)).toBe(true);
  });

  it("isStablyExpired：过期未满余量 → false（安全垫内照常构建）", () => {
    expect(isStablyExpired(NOW - 1, NOW)).toBe(false);
    // 边界恰满余量不算稳定过期（与 SQL 的严格小于一致）
    expect(isStablyExpired(NOW - PIPELINE_EXPIRY_GRACE_SECONDS, NOW)).toBe(false);
  });

  it("isStablyExpired：无截止/未来截止/非法值 → false", () => {
    expect(isStablyExpired(0, NOW)).toBe(false);
    expect(isStablyExpired(null, NOW)).toBe(false);
    expect(isStablyExpired(undefined, NOW)).toBe(false);
    expect(isStablyExpired(NOW + 100, NOW)).toBe(false);
    expect(isStablyExpired("abc", NOW)).toBe(false);
    expect(isStablyExpired("", NOW)).toBe(false);
  });

  it("isStablyExpired：BIGINT 回串（mysql2 默认）→ 正常判定", () => {
    expect(isStablyExpired(String(NOW - PIPELINE_EXPIRY_GRACE_SECONDS - 60), NOW)).toBe(true);
    expect(isStablyExpired(String(NOW + 60), NOW)).toBe(false);
  });
});

describe("toBeijingUnixTs", () => {
  it("北京时间 2024-01-01 00:00:00 → 正确 Unix 时间戳", () => {
    // 2024-01-01 00:00:00 UTC+8 = 2023-12-31 16:00:00 UTC
    const ts = toBeijingUnixTs("2024-01-01", "00:00:00");
    expect(ts).toBe(Math.floor(new Date("2023-12-31T16:00:00Z").getTime() / 1000));
  });

  it("北京时间 2024-06-15 12:30:00", () => {
    const ts = toBeijingUnixTs("2024-06-15", "12:30:00");
    const expected = Math.floor(new Date(Date.UTC(2024, 5, 15, 4, 30, 0)).getTime() / 1000);
    expect(ts).toBe(expected);
  });

  it("带秒数的时间", () => {
    const ts = toBeijingUnixTs("2024-03-15", "08:45:30");
    const expected = Math.floor(new Date(Date.UTC(2024, 2, 15, 0, 45, 30)).getTime() / 1000);
    expect(ts).toBe(expected);
  });
});
