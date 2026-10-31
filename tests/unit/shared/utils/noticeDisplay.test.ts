import { describe, it, expect } from "vitest";
import {
  pickNoticeTitle, displayNoticeAgency, formatNoticeAmount,
  type NoticeDisplayFields,
} from "@/shared/utils/noticeDisplay";

// 2026-10-31 数据归一化：本文件原测孤本 displayNoticeTitle/Budget/DeadlineLabel（已随
// 首页改走统一口径删除），改测收编后的 pickNoticeTitle / formatNoticeAmount 新口径；
// displayNoticeAgency 行为未变、原样保留。formatNoticeDeadline/Reference 的实现测试在
// tests/unit/features/procurement/utils/noticeDisplay.test.ts（经 re-export 面覆盖同一实体）。
function makeNotice(overrides: Partial<NoticeDisplayFields> = {}): NoticeDisplayFields {
  return {
    title: "原始标题",
    countryCode: "CN",
    estimatedValue: "1000.00",
    deadlineTs: null,
    ...overrides,
  };
}

describe("pickNoticeTitle（三链收敛：列表/详情/首页同一条回退）", () => {
  it("zh：titleCn 优先（服务表确认中文列，原首页链从不读它）", () => {
    expect(pickNoticeTitle(makeNotice({ titleCn: "确认中文", titleI18n: "机翻中文", title: "Original" }), "zh"))
      .toBe("确认中文");
  });

  it("zh：无 titleCn 回退 titleI18n，再回退 title", () => {
    expect(pickNoticeTitle(makeNotice({ titleI18n: "机翻中文" }), "zh")).toBe("机翻中文");
    expect(pickNoticeTitle(makeNotice({}), "zh")).toBe("原始标题");
  });

  it("非 zh：titleI18n → titleEn → title", () => {
    expect(pickNoticeTitle(makeNotice({ titleCn: "确认中文", titleI18n: "Localized", titleEn: "English" }), "en"))
      .toBe("Localized");
    expect(pickNoticeTitle(makeNotice({ titleEn: "English" }), "en")).toBe("English");
    expect(pickNoticeTitle(makeNotice({}))).toBe("原始标题");
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

describe("formatNoticeAmount（替代孤本 displayNoticeBudget：不再假设 USD、空值返回空串）", () => {
  it("null/空串/0.00 → 空串（空态文案归调用方 i18n）", () => {
    expect(formatNoticeAmount(null, "USD", "en")).toBe("");
    expect(formatNoticeAmount("", "USD", "en")).toBe("");
    expect(formatNoticeAmount("0.00", "USD", "en")).toBe("");
  });

  it("有值带币种码，不假设美元", () => {
    expect(formatNoticeAmount("50000", "BRL", "en")).toMatch(/50,000 BRL|50.000 BRL/);
    expect(formatNoticeAmount("50000", null, "en")).toMatch(/50,000|50.000/);
  });
});
