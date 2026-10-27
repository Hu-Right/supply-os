/**
 * 首页公告滚动卡渲染回归钉（2026-10 修复：字段口径对齐 unified-search 宽表列）
 * @module tests/unit/features/home/components/content/NoticeScrollCard
 * @description 复现并锁定崩溃：容器把 /api/notices/unified-search 的 item 直接喂给本卡，
 *              item 携带的是宽表列（country_code / notice_type_code / deadline_ts / buyer_name / notice_pk），
 *              而非历史展示名。修复前本卡读 notice.country（undefined）→ getCountryDisplayName
 *              对 undefined 调 toLowerCase 抛错；修复后应正常渲染国家名/标题且链接指向 notice_pk。
 *              仅静态渲染，不发网络、不触 LLM。
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoticeScrollCard, type HomeNoticeItem } from "@/features/home/components/content/NoticeScrollCard";

const t = (key: string) => key;

// 一条与 unified-search 真实返回同形的视图项（经 view mapper 后统一 camelCase，红线②）
const item: HomeNoticeItem = {
  noticePk: 12345,
  noticeId: "UN-12345",
  reference: "OS-REF-1",
  title: "某医院数字影像设备采购",
  titleEn: "Digital imaging equipment procurement",
  countryCode: "CN",
  noticeTypeCode: "Tender",
  buyerName: "联合国项目事务署",
  estimatedValue: "50000.00",
  deadlineTs: Math.floor(Date.now() / 1000) + 10 * 86400,
  deadlineType: "bid",
};

describe("NoticeScrollCard", () => {
  it("hot 变体：渲染标题与国家显示名（不因 country_code 字段口径崩溃）", () => {
    render(<NoticeScrollCard notice={item} locale="en" t={t} variant="hot" />);
    // title_en 优先于 title（回退链），locale=en 无 title_i18n → 用 title_en
    expect(screen.getByText(/Digital imaging equipment procurement/)).toBeInTheDocument();
    expect(screen.getByText(/China/)).toBeInTheDocument();
  });

  it("链接指向 /procurement?notice_id=<notice_pk>（宽表主键，非历史 id）", () => {
    render(<NoticeScrollCard notice={item} locale="en" t={t} variant="hot" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("notice_id=12345");
  });

  it("rfq 变体：显示询价徽章且不因缺字段崩溃", () => {
    render(<NoticeScrollCard notice={item} locale="en" t={t} variant="rfq" />);
    expect(screen.getByText("homeRfqBadge")).toBeInTheDocument();
    expect(screen.getByText(/China/)).toBeInTheDocument();
  });
});
