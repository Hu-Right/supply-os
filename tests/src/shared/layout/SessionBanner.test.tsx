/**
 * shared/layout/SessionBanner 组件测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionBanner } from "@/shared/layout/SessionBanner";
import { emitAppEvent } from "@/core/events";

// 覆盖全局 useLocation mock
const mockPathname = vi.fn(() => "/showroom");
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname(), search: "", hash: "", state: null, key: "" }),
  useNavigate: () => vi.fn(),
  Navigate: () => null,
}));

describe("SessionBanner", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/showroom");
    vi.mocked(emitAppEvent).mockClear();
  });

  it("渲染 SESSION ACTIVE STATUS 标签", () => {
    render(<SessionBanner />);
    expect(screen.getByText("SESSION ACTIVE STATUS")).toBeInTheDocument();
  });

  it("/showroom 路由 → 显示 showroomTitle", () => {
    mockPathname.mockReturnValue("/showroom");
    render(<SessionBanner />);
    expect(screen.getByText("showroomTitle")).toBeInTheDocument();
    expect(screen.getByText("showroomSubTitle")).toBeInTheDocument();
  });

  it("/ 路由回退到 /showroom 配置", () => {
    mockPathname.mockReturnValue("/");
    render(<SessionBanner />);
    expect(screen.getByText("showroomTitle")).toBeInTheDocument();
  });

  it("/procurement 路由 → 显示 procurementTitle", () => {
    mockPathname.mockReturnValue("/procurement");
    render(<SessionBanner />);
    expect(screen.getByText("procurementNoticePoolTitle")).toBeInTheDocument();
  });

  it("未知路由 → 不渲染", () => {
    mockPathname.mockReturnValue("/unknown");
    const { container } = render(<SessionBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("点击预约顾问 → emitAppEvent", async () => {
    const user = userEvent.setup();
    render(<SessionBanner />);
    await user.click(screen.getByText("bookServiceNow"));
    expect(emitAppEvent).toHaveBeenCalledWith("supply-os:consult");
  });

  it("/showroom → 显示注册展厅按钮", async () => {
    const user = userEvent.setup();
    mockPathname.mockReturnValue("/showroom");
    render(<SessionBanner />);
    await user.click(screen.getByText("registerShowroomBtn"));
    expect(emitAppEvent).toHaveBeenCalledWith("supply-os:open-showroom-register");
  });

  it("/supplier → 显示注册供应商按钮", async () => {
    const user = userEvent.setup();
    mockPathname.mockReturnValue("/supplier");
    render(<SessionBanner />);
    await user.click(screen.getByText("registerSupplierBtn"));
    expect(emitAppEvent).toHaveBeenCalledWith("supply-os:open-supplier-register");
  });

  it("/procurement → 显示培训注册按钮", async () => {
    const user = userEvent.setup();
    mockPathname.mockReturnValue("/procurement");
    render(<SessionBanner />);
    await user.click(screen.getByText("procurementScreeningBtn"));
    expect(emitAppEvent).toHaveBeenCalledWith("supply-os:open-training-register");
  });
});
