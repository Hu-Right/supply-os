import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { NoticeDetail } from "@/features/procurement/components/NoticeDetail";

// zh 环境：验证译文替换、原文切换与免责声明
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const baseNotice = {
  title: "Supply of Solar Panels",
  agency: "UNDP",
  country: "Kenya",
  reference: "RFQ-2026-001",
  deadline: "2026-12-31",
  description: "Original English description",
  notice_type: "RFQ",
  unspsc_codes: [],
};

const defaultProps = {
  actionMessage: "",
  membership: null,
  freeRemaining: 2,
  freeQuota: 2,
  canUsePaidQuota: false,
  isVip: false,
  onBack: vi.fn(),
  onExpressInterest: vi.fn(),
  onUnlock: vi.fn(),
  onPayUnlock: vi.fn(),
};

// fetchJsonCached 按 URL 缓存：每个用例使用独立 notice id

describe("NoticeDetail translation integration", () => {
  it("shows translated title/description and disclaimer after load", async () => {
    server.use(
      http.get("/api/notices/601/translation", () =>
        HttpResponse.json({ lang: "zh", title: "太阳能板供应", description: "中文说明", cached: true })
      )
    );
    render(<NoticeDetail {...defaultProps} notice={{ ...baseNotice, id: 601 } as any} />);
    await waitFor(() => expect(screen.getByText("太阳能板供应")).toBeInTheDocument());
    expect(screen.getByText("中文说明")).toBeInTheDocument();
    expect(screen.getByText("procurement_translateNote")).toBeInTheDocument();
    expect(screen.queryByText("Supply of Solar Panels")).toBeNull();
  });

  it("toggles back to the original text", async () => {
    server.use(
      http.get("/api/notices/602/translation", () =>
        HttpResponse.json({ lang: "zh", title: "太阳能板供应", description: "中文说明", cached: true })
      )
    );
    render(<NoticeDetail {...defaultProps} notice={{ ...baseNotice, id: 602 } as any} />);
    await waitFor(() => expect(screen.getByText("procurement_viewOriginal")).toBeInTheDocument());
    fireEvent.click(screen.getByText("procurement_viewOriginal"));
    expect(screen.getByText("Supply of Solar Panels")).toBeInTheDocument();
    expect(screen.getByText("Original English description")).toBeInTheDocument();
    expect(screen.getByText("procurement_viewTranslation")).toBeInTheDocument();
    expect(screen.queryByText("procurement_translateNote")).toBeNull();
  });

  it("keeps original text without translation UI when the endpoint fails", async () => {
    server.use(
      http.get("/api/notices/603/translation", () =>
        HttpResponse.json({ error: "TRANSLATION_UNAVAILABLE" }, { status: 503 })
      )
    );
    render(<NoticeDetail {...defaultProps} notice={{ ...baseNotice, id: 603 } as any} />);
    await waitFor(() => expect(screen.queryByText("procurement_translating")).toBeNull());
    expect(screen.getByText("Supply of Solar Panels")).toBeInTheDocument();
    expect(screen.getByText("Original English description")).toBeInTheDocument();
    expect(screen.queryByText("procurement_viewOriginal")).toBeNull();
  });
});
