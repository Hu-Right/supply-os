import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtectedRoute } from "@/shared/layout";

// Mock useAuth
const mockAuth = { authUser: null as any, isVip: false };
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

// Mock Navigate to render a marker instead of actually navigating
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{`redirect:${to}`}</div>,
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockAuth.authUser = null;
    mockAuth.isVip = false;
  });

  it("redirects to /showroom when not authenticated", () => {
    render(
      <ProtectedRoute>
        <p>Protected Content</p>
      </ProtectedRoute>
    );
    expect(screen.getByTestId("navigate")).toHaveTextContent("redirect:/showroom");
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("dispatches supply-os:require-login when not authenticated", () => {
    const handler = vi.fn();
    window.addEventListener("supply-os:require-login", handler);

    render(
      <ProtectedRoute>
        <p>Content</p>
      </ProtectedRoute>
    );

    expect(handler).toHaveBeenCalled();
    window.removeEventListener("supply-os:require-login", handler);
  });

  it("renders children when authenticated", () => {
    mockAuth.authUser = { user_key: "test", email: "test@test.com" };

    render(
      <ProtectedRoute>
        <p>Protected Content</p>
      </ProtectedRoute>
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects when requireVip but user is not VIP", () => {
    mockAuth.authUser = { user_key: "test", email: "test@test.com" };
    mockAuth.isVip = false;

    render(
      <ProtectedRoute requireVip={true}>
        <p>VIP Content</p>
      </ProtectedRoute>
    );

    expect(screen.getByTestId("navigate")).toHaveTextContent("redirect:/showroom");
    expect(screen.queryByText("VIP Content")).toBeNull();
  });

  it("renders children when requireVip and user is VIP", () => {
    mockAuth.authUser = { user_key: "test", email: "test@test.com" };
    mockAuth.isVip = true;

    render(
      <ProtectedRoute requireVip={true}>
        <p>VIP Content</p>
      </ProtectedRoute>
    );

    expect(screen.getByText("VIP Content")).toBeInTheDocument();
  });
});
