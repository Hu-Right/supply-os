/**
 * 详情页锁定态版式契约（2026-11-26 改版）
 *
 * @description 锁定态只保留「标题 + 基本信息 + 公告概况 + 锁定提示」；
 *              联系人/投标材料/AI 匹配/AI 摘要一律不渲染。
 *              独立权益（资格条件/原始文件）另测，此处用无权益账号验证默认隐藏。
 *              同时锁住：来源平台属 VIP，锁定态即使拿到 platform 也不得展示。
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NoticeDetailItem } from "@/features/procurement/types";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));
vi.mock("@/core/auth", () => ({ useUserId: () => 1 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/procurement/hooks/useNoticeTranslation", () => ({
  useNoticeTranslation: () => ({
    translation: null,
    displayTitle: null,
    translating: false,
    failed: false,
    showOriginal: false,
    toggleOriginal: vi.fn(),
  }),
}));
vi.mock("@/features/procurement/hooks/useAiAnalysis", () => ({
  useAiAnalysis: () => ({
    data: null,
    loading: false,
    streaming: false,
    error: null,
    llmConfigured: false,
    masked: false,
    triggerAnalysis: vi.fn(),
  }),
}));
vi.mock("@/features/procurement/hooks/useAiMatch", () => ({
  useAiMatch: () => ({
    data: null,
    loading: false,
    cacheLoading: false,
    error: null,
    triggerMatch: vi.fn(),
  }),
}));

// 重子组件全部打桩：本用例只验证「哪些区块被渲染」，不验证子组件内部
vi.mock("@/features/procurement/components/AiSummarySection", () => ({
  AiSummarySection: () => <div data-testid="ai-summary" />,
}));
vi.mock("@/features/procurement/components/NoticeDetail/QualificationTab", () => ({
  QualificationTab: () => <div data-testid="qual" />,
}));
vi.mock("@/features/procurement/components/NoticeDetail/BuyerContactsTab", () => ({
  BuyerContactsTab: () => <div data-testid="contacts" />,
}));
vi.mock("@/features/procurement/components/NoticeDetail/FilesTab", () => ({
  FilesTab: () => <div data-testid="files" />,
}));
vi.mock("@/features/procurement/components/NoticeDetail/SimilarTab", () => ({
  SimilarTab: () => <div data-testid="similar" />,
}));
vi.mock("@/features/procurement/components/AiEvaluationPanel", () => ({
  AiEvaluationPanel: () => <div data-testid="ai-match" />,
}));
vi.mock("@/features/procurement/components/NoticeDetailSidebar", () => ({
  NoticeDetailSidebar: () => <div data-testid="sidebar" />,
}));
vi.mock("@/features/procurement/components/NoticeDetail/ShareModal", () => ({
  ShareModal: () => null,
}));

import { NoticeDetail } from "@/features/procurement/components/NoticeDetail";

const now = Math.floor(Date.now() / 1000);

const baseNotice = {
  noticePk: 42,
  noticeId: "N-42",
  reference: "R-1",
  title: "Contratação de empresa para o fornecimento de equipamentos",
  titleCn: null,
  description:
    "Contratação de empresa para o fornecimento de equipamentos de informática para câmara municipal. ".repeat(
      8
    ),
  descriptionTruncated: true,
  noticeTypeCode: "RFQ",
  buyerName: "Câmara Municipal",
  buyerNameCn: "北卡平扎尔市议会",
  countryCode: "BR",
  publishedTs: now - 86400,
  deadlineTs: now + 5 * 86400,
  deadlineType: "bid",
  deadlineTimezone: null,
  timezoneSource: null,
  estimatedValue: "60593.38",
  currencyCode: "BRL",
  industry: "it",
  sourceUrl: undefined,
  // 现实里锁定态 /detail 不会下发 platform；这里故意给值，验证前端也不渲染
  platform: { canonical: "Portal de Compras Públicas", code: "pcp", zh: "巴西公共采购门户" },
  coreLocked: true,
} as unknown as NoticeDetailItem;

const renderDetail = (over: Partial<NoticeDetailItem>, settled = true) =>
  render(
    <NoticeDetail
      notice={{ ...baseNotice, ...over }}
      actionMessage=""
      membership={null}
      canUsePaidQuota
      isVip={false}
      totalRemaining={0}
      isLoggedIn
      onBack={vi.fn()}
      onExpressInterest={vi.fn()}
      onAccess={vi.fn()}
      onOpenNotice={vi.fn()}
      favorited={false}
      onToggleFavorite={vi.fn()}
      detailSettled={settled}
    />
  );

describe("详情页锁定态", () => {
  it("只渲染标题 + 基本信息 + 公告概况", () => {
    renderDetail({ coreLocked: true });
    expect(screen.getByText("settingsBasicInfo")).toBeInTheDocument();
    expect(screen.getByText("detail_overview")).toBeInTheDocument();
    // 付费区块一律不渲染（不是渲染成锁定空壳）
    expect(screen.queryByTestId("ai-summary")).toBeNull();
    expect(screen.queryByTestId("contacts")).toBeNull();
    expect(screen.queryByTestId("files")).toBeNull();
    expect(screen.queryByTestId("ai-match")).toBeNull();
    // 无资格权益 → 资格区块也不出现
    expect(screen.queryByTestId("qual")).toBeNull();
  });

  it("来源平台是 VIP：锁定态即使有 platform 也不展示", () => {
    renderDetail({ coreLocked: true });
    expect(screen.queryByText("detail_sourcePlatform")).toBeNull();
    expect(screen.queryByText("巴西公共采购门户")).toBeNull();
  });

  it("倒计时并入截止时间单元格", () => {
    renderDetail({ coreLocked: true });
    expect(screen.getByText("detail_deadline")).toBeInTheDocument();
    expect(screen.getByText(/detail_countdownDays/)).toBeInTheDocument();
  });
});

describe("详情页解锁态", () => {
  it("展示来源平台行与全部付费区块", () => {
    renderDetail({ coreLocked: false });
    expect(screen.getByText("detail_sourcePlatform")).toBeInTheDocument();
    expect(screen.getByText("巴西公共采购门户")).toBeInTheDocument();
    expect(screen.getByTestId("ai-summary")).toBeInTheDocument();
    expect(screen.getByTestId("qual")).toBeInTheDocument();
    expect(screen.getByTestId("contacts")).toBeInTheDocument();
    expect(screen.getByTestId("files")).toBeInTheDocument();
    expect(screen.getByTestId("ai-match")).toBeInTheDocument();
    // 锁定态专属的概况区不应出现（正文区由采购说明承担；锚点导航里也有同名 key）
    expect(screen.queryByText("detail_overview")).toBeNull();
    expect(screen.getAllByText("procurement_description").length).toBeGreaterThan(0);
  });
});
