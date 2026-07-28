import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecentUnlocks } from "@/features/payment/components/RecentUnlocks";
import * as api from "@/features/payment/api";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

describe("RecentUnlocks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders latest unlocks and opens a notice on click", async () => {
    const spy = vi.spyOn(api, "fetchUnlocks").mockResolvedValue({
      list: [
        {
          user_key: "uk",
          notice_id: 11,
          unlock_type: "single",
          price: 89,
          unlocked_at: "2026-07-01T00:00:00Z",
          notice: { id: 11, title: "Recent Notice" },
        },
      ],
      total: 1,
    } as any);

    const onOpenNotice = vi.fn();
    render(<RecentUnlocks userKey="uk" onOpenNotice={onOpenNotice} />);

    await waitFor(() => expect(screen.getByText("Recent Notice")).toBeInTheDocument());
    // limits the query to the latest 3 records; locale from useLocale mock
    expect(spy).toHaveBeenCalledWith({ userKey: "uk", limit: 3, locale: "zh" });

    fireEvent.click(screen.getByText("myPurchasesOpenDetail"));
    expect(onOpenNotice).toHaveBeenCalledWith(11);
  });

  it("renders nothing when there are no records", async () => {
    vi.spyOn(api, "fetchUnlocks").mockResolvedValue({ list: [], total: 0 } as any);
    const { container } = render(
      <RecentUnlocks userKey="uk" onOpenNotice={vi.fn()} />
    );
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders nothing when the request fails", async () => {
    vi.spyOn(api, "fetchUnlocks").mockRejectedValue(new Error("network"));
    const { container } = render(
      <RecentUnlocks userKey="uk" onOpenNotice={vi.fn()} />
    );
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders translated title with original toggle and AI note", async () => {
    vi.spyOn(api, "fetchUnlocks").mockResolvedValue({
      list: [
        {
          user_key: "uk",
          notice_id: 11,
          unlock_type: "single",
          price: 89,
          unlocked_at: "2026-07-01T00:00:00Z",
          notice: { id: 11, title: "Recent Notice", title_i18n: "近期公告" },
        },
      ],
      total: 1,
    } as any);
    render(<RecentUnlocks userKey="uk" onOpenNotice={vi.fn()} />);

    // 默认显示译文 + AI 来源提示 + "查看原文"按钮
    await waitFor(() => expect(screen.getByText("近期公告")).toBeInTheDocument());
    expect(screen.getByText("procurement_translateNote")).toBeInTheDocument();

    // 切原文：标题变原文、AI 提示消失、按钮变"查看译文"
    fireEvent.click(screen.getByText("procurement_viewOriginal"));
    expect(screen.getByText("Recent Notice")).toBeInTheDocument();
    expect(screen.queryByText("procurement_translateNote")).not.toBeInTheDocument();
    expect(screen.getByText("procurement_viewTranslation")).toBeInTheDocument();
  });

  it("hides toggle and note when no translation is available", async () => {
    vi.spyOn(api, "fetchUnlocks").mockResolvedValue({
      list: [
        {
          user_key: "uk",
          notice_id: 11,
          unlock_type: "single",
          price: 89,
          notice: { id: 11, title: "Recent Notice", title_i18n: null },
        },
      ],
      total: 1,
    } as any);
    render(<RecentUnlocks userKey="uk" onOpenNotice={vi.fn()} />);
    // 缺译回退原文，无切换按钮、无 AI 提示（en 环境同此形态）
    await waitFor(() => expect(screen.getByText("Recent Notice")).toBeInTheDocument());
    expect(screen.queryByText("procurement_viewOriginal")).not.toBeInTheDocument();
    expect(screen.queryByText("procurement_translateNote")).not.toBeInTheDocument();
  });
});
