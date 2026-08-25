/**
 * shared/layout/AppFooter 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppFooter } from "@/shared/layout/AppFooter";

const mockApiCached = vi.fn();
vi.mock("@/core/http/api-client", () => ({
  apiCached: (...args: unknown[]) => mockApiCached(...args),
}));

describe("AppFooter", () => {
  const defaultProps = {
    activeTab: "/showroom",
    onSwitchTab: vi.fn(),
    onOpenConsult: vi.fn(),
  };

  it("渲染版权信息", () => {
    mockApiCached.mockReturnValue(Promise.resolve({}));
    render(<AppFooter {...defaultProps} />);
    expect(screen.getByText("footerCopyright")).toBeInTheDocument();
  });

  it("获取 ICP 备案后显示", async () => {
    mockApiCached
      .mockResolvedValueOnce({ bah: "京ICP备12345号" })
      .mockResolvedValueOnce([]);
    render(<AppFooter {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("京ICP备12345号")).toBeInTheDocument();
    });
  });

  it("获取链接后显示社交图标", async () => {
    mockApiCached
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([
        { id: 1, name: "WeChat", url: "https://weixin.qq.com", icon: "wechat" },
      ]);
    render(<AppFooter {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByLabelText("WeChat")).toBeInTheDocument();
    });
  });

  it("显示服务条款链接", () => {
    mockApiCached.mockReturnValue(Promise.resolve({}));
    render(<AppFooter {...defaultProps} />);
    expect(screen.getByText("footerTerms")).toBeInTheDocument();
    expect(screen.getByText("footerPrivacy")).toBeInTheDocument();
    expect(screen.getByText("footerUnspsc")).toBeInTheDocument();
  });

  it("ICP 为空时不显示备案链接", () => {
    mockApiCached.mockResolvedValue({});
    render(<AppFooter {...defaultProps} />);
    expect(screen.queryByText(/ICP/)).not.toBeInTheDocument();
  });
});
