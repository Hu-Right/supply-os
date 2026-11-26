/**
 * SEO 公开页（/procurement/notice/[id]）版式契约
 *
 * @description 2026-11-26 把公开页改成与详情页同形制：标题 + 基本信息表 + 公告概况。
 *              本测试锁住几件事：
 *              1) 事实以「基本信息」表格呈现（防止有人改回散文要点）；
 *              2) 来源平台属 VIP，公开页绝不出现；
 *              3) 300 字概况仍在（公开面唯一正文片段）；
 *              4) 同买家公告块（第三条内链轴）渲染且标题中文优先，
 *                 buyer_id 缺失时整块消失且不发起查询。
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

// vi.mock 会被提升到 import 之前，夹具必须走 vi.hoisted
const { ROW, PUBLISHED, UPDATED, BUYER_RELATED, findRelatedByBuyerMock } = vi.hoisted(() => {
  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = nowSec + 5 * 86400;
  const published = nowSec - 3 * 86400;
  const updated = published + 86400; // 对账修正过一行：更新时间晚于发布日
  const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
  return {
    PUBLISHED: published,
    UPDATED: updated,
    ROW: {
      id: 42,
      notice_id: "01651692000109-1-000017/2026",
      reference: "01651692000109-1-000017/2026",
      title: "Contratação de empresa para o fornecimento de equipamentos",
      title_cn: null,
      notice_type: "RFQ",
      agency: "北卡平扎尔市议会",
      agency_full: "Câmara Municipal de Capinzal do Norte",
      buyer_id: 7 as number | null,
      country_code: "BR",
      deadline: "2026-12-01",
      deadline_ts: deadline,
      deadline_sec: deadline,
      deadline_state: "known",
      deadline_type: "bid",
      effective_ts: deadline,
      deadline_timezone: null,
      timezone_source: null,
      estimated_value: "60593.38",
      industry: "it",
      published_ts: published,
      published_date: iso(published),
      updated_at: updated,
      description:
        "Contratação de empresa para o fornecimento de equipamentos de informática para câmara municipal. ".repeat(
          8
        ),
      description_cn: null,
      description_truncated: 1,
    },
    // 同买家公告：一条有可用中文译文（锚文本应显示中文），一条无译文（回退原文）
    BUYER_RELATED: [
      { id: 43, title: "Supply of office equipment", title_cn: "办公设备供应公告", deadline_ts: deadline },
      { id: 44, title: "Aquisição de materiais escolares", title_cn: null, deadline_ts: 0 },
    ],
    findRelatedByBuyerMock: vi.fn(async () => BUYER_RELATED),
  };
});

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    notice: {
      detailRepo: {
        findSeoDetailFromPublic: async () => ROW,
        findRelatedByCountry: async () => [],
        findRelatedByBuyer: findRelatedByBuyerMock,
      },
    },
  }),
}));

import NoticeSeoPage from "@/app/(zh)/(public)/procurement/notice/[id]/page";

const renderPage = async () => {
  const ui = await NoticeSeoPage({ params: Promise.resolve({ id: "42" }) });
  return render(ui);
};

/** 取页面自己那段 JSON-LD 里的 Article（根 layout 的 Organization/WebSite 不在此渲染树内） */
const readArticle = () => {
  const script = document.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  const parsed = JSON.parse(script?.textContent || "[]") as Array<Record<string, unknown>>;
  return parsed.find((node) => node["@type"] === "Article");
};

describe("公开页版式（SEO 详情页）", () => {
  it("事实用「基本信息」表格呈现，不再是一段散文要点", async () => {
    await renderPage();
    expect(screen.getByText("基本信息")).toBeInTheDocument();
    expect(screen.getByText("参考编号")).toBeInTheDocument();
    expect(screen.getByText(ROW.reference)).toBeInTheDocument();
    expect(screen.getByText("机构")).toBeInTheDocument();
    expect(screen.getByText("北卡平扎尔市议会")).toBeInTheDocument();
    expect(screen.getByText("国家/地区")).toBeInTheDocument();
    expect(screen.getByText("采购类型")).toBeInTheDocument();
    expect(screen.getByText("RFQ")).toBeInTheDocument();
    expect(screen.getByText("预算/金额")).toBeInTheDocument();
    expect(screen.getByText("60593.38")).toBeInTheDocument();
    // 旧的「要点」散文块已删除
    expect(screen.queryByText("要点")).toBeNull();
  });

  it("来源平台是 VIP：公开页不渲染该行", async () => {
    await renderPage();
    expect(screen.queryByText("来源平台")).toBeNull();
  });

  it("保留 300 字公告概况与剩余天数", async () => {
    await renderPage();
    expect(screen.getByText("公告概况")).toBeInTheDocument();
    expect(screen.getByText(/剩余 \d+ 天/)).toBeInTheDocument();
  });

  it("JSON-LD：dateModified 取服务表 updated_at，不再等于发布日期", async () => {
    await renderPage();
    const article = readArticle();
    const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
    expect(article?.datePublished).toBe(iso(PUBLISHED));
    expect(article?.dateModified).toBe(iso(UPDATED));
    expect(article?.dateModified).not.toBe(article?.datePublished);
  });

  it("JSON-LD：与页面可见字段一一对应（编号/机构/国家/类型/截止/行业）", async () => {
    await renderPage();
    const article = readArticle();
    const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
    const place = article?.spatialCoverage as { name?: string } | undefined;
    const about = article?.about as { name?: string } | undefined;
    expect(article?.identifier).toBe(ROW.reference);
    expect(article?.mentions).toMatchObject({ "@type": "Organization", name: ROW.agency });
    expect(place).toMatchObject({ "@type": "Place", addressCountry: "BR" });
    expect(String(place?.name ?? "")).not.toBe("");
    expect(article?.genre).toBeTruthy();
    expect(article?.expires).toBe(iso(ROW.deadline_ts));
    expect(about).toMatchObject({ "@type": "Thing" });
    expect(String(about?.name ?? "")).not.toBe("");
  });

  it("脏 updated_at（YYYYMMDDHHMMSS 形态）回退到发布日期，不输出 2612 年", async () => {
    const original = ROW.updated_at;
    ROW.updated_at = 20_261_030_012;
    try {
      await renderPage();
      const article = readArticle();
      expect(article?.dateModified).toBe(article?.datePublished);
      expect(String(article?.dateModified)).not.toContain("2612");
    } finally {
      ROW.updated_at = original;
    }
  });

  it("同买家公告块：渲染、锚文本中文优先、无译文回退原文", async () => {
    findRelatedByBuyerMock.mockClear();
    await renderPage();
    expect(screen.getByText("该采购方的其他公告")).toBeInTheDocument();
    // 有可用中文译文 → 锚文本显示中文，原文不出现
    expect(screen.getByText("办公设备供应公告")).toBeInTheDocument();
    expect(screen.queryByText("Supply of office equipment")).toBeNull();
    const link = screen.getByText("办公设备供应公告").closest("a");
    expect(link?.getAttribute("href")).toBe("/procurement/notice/43");
    // 无译文条目回退原文展示
    expect(screen.getByText("Aquisição de materiais escolares")).toBeInTheDocument();
    // 无截止时间 → 「长期有效」
    expect(screen.getByText("长期有效")).toBeInTheDocument();
  });

  it("buyer_id 缺失：整块消失且不发起买家查询", async () => {
    findRelatedByBuyerMock.mockClear();
    const original = ROW.buyer_id;
    ROW.buyer_id = null;
    try {
      await renderPage();
      expect(screen.queryByText("该采购方的其他公告")).toBeNull();
      expect(findRelatedByBuyerMock).not.toHaveBeenCalled();
    } finally {
      ROW.buyer_id = original;
    }
  });
});
