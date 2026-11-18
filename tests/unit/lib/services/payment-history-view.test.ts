/**
 * 解锁历史 mapper 单测（红线② 键名 + 三处契约谎报的回归锁）
 *
 * 覆盖：camel 键、嵌套 notice、deadlineExpired 的三种判定、
 * 以及「不外发 description / user_id」这两条裁剪口径。
 */
import { describe, it, expect } from "vitest";
import { toAccessRecordView, toAccessRecordViews } from "@/lib/services/payment-history-view";
import type { AccessHistoryRow } from "@/lib/repos/payment-history.repo";

const NOW = Date.UTC(2026, 9, 27, 0, 0, 0);
const DAY_SEC = 86_400;

function row(over: Partial<AccessHistoryRow> = {}): AccessHistoryRow {
  return {
    user_id: 7,
    notice_id: 1234,
    grant_type: "subscription",
    price: 99,
    granted_at: new Date(NOW),
    external_notice_id: "GJ-2026-001",
    reference: "REF-1",
    title: "某公告标题",
    notice_type: "tender",
    agency: "AHA",
    agency_full: "Agency Full Name",
    country: "Latvia",
    deadline: "2026-11-01",
    deadline_ts: Math.floor(NOW / 1000) + 5 * DAY_SEC,
    url: "https://x/1",
    industry: "IT",
    ...over,
  };
}

describe("toAccessRecordView（/api/payment/access-records 响应体）", () => {
  it("键名全为 camelCase，且不外发 DB 列名/内部字段", () => {
    const view = toAccessRecordView(row(), NOW);
    const keys = Object.keys(view);
    expect(keys).toEqual(["noticeId", "grantType", "price", "grantedAt", "notice"]);
    // 平铺行的公告列不得再出现在顶层（曾经的整行透传就是这里漏的）
    expect(keys.filter((k) => /_[a-z0-9]/.test(k))).toEqual([]);
    expect(keys).not.toContain("user_id");
    expect(keys).not.toContain("userId");
    expect(view).not.toHaveProperty("description");
  });

  it("notice 摘要嵌套为 camel，含 titleI18n / deadlineExpired，且不带 description", () => {
    const view = toAccessRecordView(row({ title_i18n: "标题译文", description: "整段正文" }), NOW);
    expect(view.notice).toMatchObject({
      title: "某公告标题",
      titleI18n: "标题译文",
      agencyFull: "Agency Full Name",
      noticeType: "tender",
      country: "Latvia",
      deadlineExpired: false,
    });
    expect(view.notice).not.toHaveProperty("description");
    expect(Object.keys(view.notice!).filter((k) => /_[a-z0-9]/.test(k))).toEqual([]);
  });

  it("deadlineExpired 三种判定：未来 false / 已过 true / 无时间戳 null", () => {
    expect(toAccessRecordView(row({ deadline_ts: Math.floor(NOW / 1000) + DAY_SEC }), NOW).notice?.deadlineExpired).toBe(false);
    expect(toAccessRecordView(row({ deadline_ts: Math.floor(NOW / 1000) - DAY_SEC }), NOW).notice?.deadlineExpired).toBe(true);
    expect(toAccessRecordView(row({ deadline_ts: null }), NOW).notice?.deadlineExpired).toBeNull();
    // 0 视为无有效截止（库里用 0 表示缺失）
    expect(toAccessRecordView(row({ deadline_ts: 0 }), NOW).notice?.deadlineExpired).toBeNull();
  });

  it("无公告关联（LEFT JOIN 未命中）→ notice 为 null，不造假摘要", () => {
    const view = toAccessRecordView(row({ notice_id: null, title: null }), NOW);
    expect(view.notice).toBeNull();
  });

  it("grantedAt 归一为 ISO 字符串，price 归一为数字", () => {
    const view = toAccessRecordView(row({ granted_at: new Date(NOW), price: "199.00" as unknown as number }), NOW);
    expect(view.grantedAt).toBe(new Date(NOW).toISOString());
    expect(view.price).toBe(199);
  });

  it("toAccessRecordViews 批量映射且逐行独立", () => {
    const views = toAccessRecordViews([row(), row({ notice_id: 1235, grant_type: "single" })], NOW);
    expect(views).toHaveLength(2);
    expect(views[1]).toMatchObject({ noticeId: 1235, grantType: "single" });
  });
});
