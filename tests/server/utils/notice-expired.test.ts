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
