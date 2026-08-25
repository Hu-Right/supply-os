/**
 * shared/layout/ProtectedRoute 组件测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtectedRoute } from "@/shared/layout/ProtectedRoute";
import { emitAppEvent } from "@/core/events";

// 覆盖全局 useAuth mock（本文件需要可变状态）
const mockAuth = vi.fn(() => ({ authUser: null, isVip: false }));
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth(),
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.mocked(emitAppEvent).mockClear();
    mockAuth.mockReturnValue({ authUser: null, isVip: false });
  });

  it("已登录 → 渲染 children", () => {
    mockAuth.mockReturnValue({ authUser: { email: "a@b.com" } as any, isVip: false });
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("未登录 → Navigate (不渲染 children)", () => {
    mockAuth.mockReturnValue({ authUser: null, isVip: false });
    render(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  it("未登录 → 触发 require-login 事件", () => {
    mockAuth.mockReturnValue({ authUser: null, isVip: false });
    render(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>,
    );
    expect(emitAppEvent).toHaveBeenCalledWith("supply-os:require-login");
  });

  it("requireVip + 非 VIP → Navigate", () => {
    mockAuth.mockReturnValue({ authUser: { email: "a@b.com" } as any, isVip: false });
    render(
      <ProtectedRoute requireVip>
        <div>VIP Content</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText("VIP Content")).not.toBeInTheDocument();
  });

  it("requireVip + 非 VIP → 触发 require-vip 事件", () => {
    mockAuth.mockReturnValue({ authUser: { email: "a@b.com" } as any, isVip: false });
    render(
      <ProtectedRoute requireVip>
        <div>VIP</div>
      </ProtectedRoute>,
    );
    expect(emitAppEvent).toHaveBeenCalledWith("supply-os:require-vip");
  });

  it("requireVip + VIP → 渲染 children", () => {
    mockAuth.mockReturnValue({ authUser: { email: "a@b.com" } as any, isVip: true });
    render(
      <ProtectedRoute requireVip>
        <div>VIP Content</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("VIP Content")).toBeInTheDocument();
  });
});
