import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppFooter } from "@/shared/layout/AppFooter";
import { apiCached } from "@/core/http/api-client";

// ── Mock useLocale（t 返回 key）──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// ── Mock apiCached（ICP 备案号拉取）──
vi.mock("@/core/http/api-client", () => ({
  apiCached: vi.fn(),
}));

function renderFooter(props: Partial<React.ComponentProps<typeof AppFooter>> = {}) {
  const merged = {
    activeTab: 1,
    onSwitchTab: vi.fn(),
    onOpenConsult: vi.fn(),
    ...props,
  };
  const utils = render(<AppFooter {...merged} />);
  return { ...utils, props: merged };
}

describe("AppFooter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiCached).mockResolvedValue({ bah: "" });
  });

  it("renders desktop footer copyright and legal links", () => {
    renderFooter();
    expect(screen.getByText("footerCopyright")).toBeInTheDocument();
    expect(screen.getByText("footerTerms")).toBeInTheDocument();
    expect(screen.getByText("footerPrivacy")).toBeInTheDocument();
    expect(screen.getByText("footerUnspsc")).toBeInTheDocument();
  });

  it("renders mobile bottom nav with 5 tabs and highlights active one", () => {
    renderFooter({ activeTab: 2 });
    expect(screen.getByText("展厅")).toBeInTheDocument();
    expect(screen.getByText("公采")).toBeInTheDocument();
    expect(screen.getByText("供应商")).toBeInTheDocument();
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByText("学习")).toBeInTheDocument();
    // 激活 tab 高亮：text-teal-600 font-bold
    expect(screen.getByText("公采").closest("button")?.className).toContain("text-teal-600");
    expect(screen.getByText("展厅").closest("button")?.className).not.toContain("text-teal-600");
  });

  it("clicking mobile bottom tab calls onSwitchTab", () => {
    const { props } = renderFooter();
    fireEvent.click(screen.getByText("CRM"));
    expect(props.onSwitchTab).toHaveBeenCalledWith(4);
  });

  it("consult FAB triggers onOpenConsult", () => {
    const { props } = renderFooter();
    // FAB 为移动端唯一按钮（MessageSquare 图标），通过类名定位渐变圆钮
    const fab = document.querySelector(".fixed.bottom-18 button")!;
    fireEvent.click(fab);
    expect(props.onOpenConsult).toHaveBeenCalled();
  });

  it("shows ICP link when apiCached returns bah", async () => {
    vi.mocked(apiCached).mockResolvedValue({ bah: "京ICP备2026001号" });
    renderFooter();
    await waitFor(() => {
      expect(screen.getByText("京ICP备2026001号")).toBeInTheDocument();
    });
    const link = screen.getByText("京ICP备2026001号");
    expect(link).toHaveAttribute("href", "https://beian.miit.gov.cn/");
    // 请求带 1 小时 TTL
    expect(apiCached).toHaveBeenCalledWith("/api/system/icp", 60 * 60 * 1000);
  });

  it("silently ignores ICP fetch failure", async () => {
    vi.mocked(apiCached).mockRejectedValue(new Error("network down"));
    renderFooter();
    // 不崩溃，页脚正常渲染
    expect(screen.getByText("footerCopyright")).toBeInTheDocument();
    await waitFor(() => expect(apiCached).toHaveBeenCalled());
  });
});
