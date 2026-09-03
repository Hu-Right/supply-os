import { describe, it, expect } from "vitest";
import {
  ACTIVE_NOTICE_WHERE,
  ACTIVE_OPP_WHERE,
  ACTIVE_NOTICE_WHERE_NO_ALIAS,
  MEILI_ACTIVE_FILTER,
  toBeijingUnixTs,
} from "@/lib/utils/notice-expired";

describe("公告过期常量", () => {
  it("ACTIVE_NOTICE_WHERE 包含 n.deadline_sec", () => {
    expect(ACTIVE_NOTICE_WHERE).toContain("n.deadline_sec");
    expect(ACTIVE_NOTICE_WHERE).toContain("deadline_sec = 0");
    expect(ACTIVE_NOTICE_WHERE).toContain("UNIX_TIMESTAMP(NOW())");
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
