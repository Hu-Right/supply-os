/**
 * server/utils/notice-expired.ts 测试
 */
import { describe, it, expect } from "vitest";
import {
  DEADLINE_SEC_EXPR,
  ACTIVE_NOTICE_WHERE,
  ACTIVE_OPP_WHERE,
  ACTIVE_NOTICE_WHERE_NO_ALIAS,
  MEILI_ACTIVE_FILTER,
  toBeijingUnixTs,
} from "../../../server/utils/notice-expired";

describe("DEADLINE_SEC_EXPR", () => {
  it("使用 n. 别名引用 deadline_sec", () => {
    expect(DEADLINE_SEC_EXPR).toBe("n.deadline_sec");
  });
});

describe("ACTIVE_NOTICE_WHERE", () => {
  it("包含 deadline_sec = 0 条件（无截止日期）", () => {
    expect(ACTIVE_NOTICE_WHERE).toContain("n.deadline_sec = 0");
  });

  it("包含 UNIX_TIMESTAMP(NOW()) 条件（未过期）", () => {
    expect(ACTIVE_NOTICE_WHERE).toContain("UNIX_TIMESTAMP(NOW())");
  });

  it("使用 n. 表别名", () => {
    expect(ACTIVE_NOTICE_WHERE).toContain("n.deadline_sec");
    expect(ACTIVE_NOTICE_WHERE).not.toContain("o.deadline_sec");
  });

  it("OR 连接两个条件", () => {
    expect(ACTIVE_NOTICE_WHERE).toMatch(/^\(.*OR.*\)$/);
  });
});

describe("ACTIVE_OPP_WHERE", () => {
  it("使用 o. 表别名", () => {
    expect(ACTIVE_OPP_WHERE).toContain("o.deadline_sec");
    expect(ACTIVE_OPP_WHERE).not.toContain("n.deadline_sec");
  });

  it("包含 deadline_sec = 0 条件", () => {
    expect(ACTIVE_OPP_WHERE).toContain("o.deadline_sec = 0");
  });
});

describe("ACTIVE_NOTICE_WHERE_NO_ALIAS", () => {
  it("不含表别名", () => {
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).not.toContain("n.");
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).not.toContain("o.");
  });

  it("使用裸 deadline_sec 列名", () => {
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).toContain("deadline_sec = 0");
    expect(ACTIVE_NOTICE_WHERE_NO_ALIAS).toContain("deadline_sec >= UNIX_TIMESTAMP(NOW())");
  });
});

describe("MEILI_ACTIVE_FILTER", () => {
  it("使用 {now} 占位符", () => {
    expect(MEILI_ACTIVE_FILTER).toContain("{now}");
  });

  it("包含 deadline_sec = 0 条件", () => {
    expect(MEILI_ACTIVE_FILTER).toContain("deadline_sec = 0");
  });

  it("不包含 UNIX_TIMESTAMP", () => {
    expect(MEILI_ACTIVE_FILTER).not.toContain("UNIX_TIMESTAMP");
  });
});

describe("toBeijingUnixTs", () => {
  it("正确转换北京时间字符串为 Unix 时间戳", () => {
    // 2026-01-01 08:00:00 北京时间 = 2026-01-01 00:00:00 UTC = 1767225600
    const ts = toBeijingUnixTs("2026-01-01", "08:00:00");
    expect(ts).toBe(Math.floor(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).getTime() / 1000));
  });

  it("午夜 00:00:00 正确转换", () => {
    // 北京时间 00:00 = UTC 前一天 16:00
    const ts = toBeijingUnixTs("2026-06-15", "00:00:00");
    expect(ts).toBe(Math.floor(new Date(Date.UTC(2026, 5, 14, 16, 0, 0)).getTime() / 1000));
  });

  it("含分钟和秒的时间", () => {
    const ts = toBeijingUnixTs("2026-03-15", "14:30:45");
    expect(ts).toBe(Math.floor(new Date(Date.UTC(2026, 2, 15, 6, 30, 45)).getTime() / 1000));
  });

  it("返回整数（Math.floor）", () => {
    const ts = toBeijingUnixTs("2026-07-01", "12:00:00");
    expect(Number.isInteger(ts)).toBe(true);
  });
});
