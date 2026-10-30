import { describe, it, expect } from "vitest";
import {
  displayNoticeTitle, displayNoticeAgency, displayNoticeBudget, displayDeadlineLabel,
  type NoticeDisplayFields,
} from "@/shared/utils/noticeDisplay";

// 2026-10 修复首页 NoticeScrollCard 崩溃：展示层字段口径对齐 unified-search 的响应视图
// （countryCode / noticeTypeCode / deadlineTs / buyerName），不再是历史展示名。
function makeNotice(overrides: Partial<NoticeDisplayFields> = {}): NoticeDisplayFields {
  return {
    title: "原始标题",
    countryCode: "CN",
    estimatedValue: "1000.00",
    deadlineTs: null,
    ...overrides,
  };
}

describe("displayNoticeTitle", () => {
  it("优先返回 title_i18n", () => {
    expect(displayNoticeTitle(makeNotice({ titleI18n: "本地化标题", titleEn: "English" })))
      .toBe("本地化标题");
  });

  it("无 title_i18n 时回退到 title_en", () => {
    expect(displayNoticeTitle(makeNotice({ titleEn: "English" })))
      .toBe("English");
  });

  it("无 i18n/en 时回退到原始 title", () => {
    expect(displayNoticeTitle(makeNotice({ title: "原始标题" })))
      .toBe("原始标题");
  });
});

describe("displayNoticeAgency（2026-10-30 首页向服务表对齐：zh 读 buyerNameCn 快照列）", () => {
  it("zh 下优先返回 buyerNameCn（与列表卡 NoticeCard 同源同值）", () => {
    expect(displayNoticeAgency(makeNotice({ buyerNameCn: "南非国家公路局", buyerName: "SANRAL (South Africa)" }), "zh"))
      .toBe("南非国家公路局");
  });

  it("zh 下无中文列时回退到 buyerName 原名", () => {
    expect(displayNoticeAgency(makeNotice({ buyerName: "UNDP" }), "zh"))
      .toBe("UNDP");
  });

  it("非 zh 下返回 buyerName 原名，中文列不得漏进其他语言界面", () => {
    expect(displayNoticeAgency(makeNotice({ buyerNameCn: "南非国家公路局", buyerName: "SANRAL (South Africa)" }), "en"))
      .toBe("SANRAL (South Africa)");
    expect(displayNoticeAgency(makeNotice({ buyerNameCn: "南非国家公路局", buyerName: "SANRAL (South Africa)" })))
      .toBe("SANRAL (South Africa)");
  });

  it("agencyI18n 别名链退役：不再参与取值", () => {
    expect(displayNoticeAgency(makeNotice({ agencyI18n: "别名链译名", buyerName: "UNDP" }), "zh"))
      .toBe("UNDP");
  });

  it("都为空时返回空串", () => {
    expect(displayNoticeAgency(makeNotice(), "zh")).toBe("");
  });
});

describe("displayNoticeBudget", () => {
  it("null 返回 预算详谈", () => {
    expect(displayNoticeBudget(null)).toBe("预算详谈");
  });

  it("空字符串返回 预算详谈", () => {
    expect(displayNoticeBudget("")).toBe("预算详谈");
  });

  it("0.00 返回 预算详谈", () => {
    expect(displayNoticeBudget("0.00")).toBe("预算详谈");
  });

  it("有值时格式化为 USD", () => {
    expect(displayNoticeBudget("50000")).toBe("USD 50,000");
  });
});

describe("displayDeadlineLabel（入参为宽表 deadline_ts，秒级，可能为字符串）", () => {
  it("null 返回 长期有效（无截止日期哨兵口径）", () => {
    expect(displayDeadlineLabel(null)).toBe("长期有效");
  });

  it("undefined 返回 长期有效", () => {
    expect(displayDeadlineLabel(undefined)).toBe("长期有效");
  });

  it("空串 返回 长期有效", () => {
    expect(displayDeadlineLabel("")).toBe("长期有效");
  });

  it("过去时间戳返回 已截止", () => {
    expect(displayDeadlineLabel(1000)).toBe("已截止"); // 1970 年
  });

  it("字符串数字同样处理", () => {
    expect(displayDeadlineLabel("1000")).toBe("已截止");
  });

  it("0 返回 长期有效（deadline_ts=0 = 无截止日期，永不过期）", () => {
    expect(displayDeadlineLabel(0)).toBe("长期有效");
  });

  it("未来时间戳返回 截止 N 天", () => {
    const futureSec = Math.floor(Date.now() / 1000) + 10 * 86400;
    expect(displayDeadlineLabel(futureSec)).toMatch(/^截止 \d+ 天$/);
  });

  it("超过 365 天返回具体日期", () => {
    const futureSec = Math.floor(Date.now() / 1000) + 400 * 86400;
    expect(displayDeadlineLabel(futureSec)).toMatch(/\d{4}-\d{2}-\d{2} 截止/);
  });
});
