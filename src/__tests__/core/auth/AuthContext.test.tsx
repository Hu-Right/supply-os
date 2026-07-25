import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { AuthProvider, useAuth } from "@/core/auth";
import { server } from "../../mocks/server";
import type { AuthUser } from "@/types/auth";

// ── Test consumer component ──
function AuthConsumer() {
  const { authUser, isVip, isAuthLoading, login, register, logout, refreshAuth, claimMessage, submitSupplierClaim } = useAuth();
  const [error, setError] = useState("");
  return (
    <div>
      <span data-testid="user">{authUser ? authUser.email : "null"}</span>
      <span data-testid="vip">{String(isVip)}</span>
      <span data-testid="loading">{String(isAuthLoading)}</span>
      <span data-testid="claim">{claimMessage}</span>
      <span data-testid="error">{error}</span>
      <button data-testid="btn-login" onClick={async () => { try { await login("a@b.com", "pass123"); } catch (e: any) { setError(e.message); } }}>login</button>
      <button data-testid="btn-register" onClick={async () => { try { await register("a@b.com", "pass123", "TestUser"); } catch (e: any) { setError(e.message); } }}>register</button>
      <button data-testid="btn-logout" onClick={logout}>logout</button>
      <button data-testid="btn-refresh" onClick={async () => { await refreshAuth(); }}>refresh</button>
      <button data-testid="btn-claim" onClick={async () => { await submitSupplierClaim({ companyName: "Test Co", supplierType: "domestic", contactName: "John", contactPhone: "123", businessLicenseNo: "BL001" }); }}>claim</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider><AuthConsumer /></AuthProvider>
  );
}

// ── Mock user factory ──
function makeUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    user_key: "uk_001",
    email: "a@b.com",
    display_name: "TestUser",
    membership_tier: "free",
    ...overrides,
  };
}

// ── MSW override helpers ──
function mockLoginSuccess(user: AuthUser) {
  server.use(
    http.post("/api/auth/login", () => HttpResponse.json({ user })),
    http.post("/api/auth/register", () => HttpResponse.json({ user }))
  );
}

function mockLoginError(status: number, error: string) {
  server.use(
    http.post("/api/auth/login", () => HttpResponse.json({ error }, { status })),
    http.post("/api/auth/register", () => HttpResponse.json({ error }, { status }))
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // ── 1. login() success ──
  it("login() success → authUser + isVip update", async () => {
    const user = makeUser();
    mockLoginSuccess(user);
    renderAuth();

    expect(screen.getByTestId("user").textContent).toBe("null");

    await act(async () => {
      screen.getByTestId("btn-login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("a@b.com");
    });
    expect(screen.getByTestId("vip").textContent).toBe("false");
  });

  // ── 2. login() failure ──
  it("login() failure → error message shown", async () => {
    mockLoginError(401, "Invalid credentials");
    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("Invalid credentials");
    });
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  // ── 3. register() success ──
  it("register() success → persistAuthUser update", async () => {
    const user = makeUser({ email: "new@b.com" });
    mockLoginSuccess(user);
    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-register").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("new@b.com");
    });

    // Verify localStorage was written
    const stored = window.localStorage.getItem("supply_os_auth_user");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).email).toBe("new@b.com");
  });

  // ── 4. register() failure ──
  it("register() failure → error message shown", async () => {
    mockLoginError(400, "Email already exists");
    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-register").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("Email already exists");
    });
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  // ── 5. logout() → clear state + localStorage ──
  it("logout() → authUser cleared + localStorage removed", async () => {
    const user = makeUser();
    mockLoginSuccess(user);
    renderAuth();

    // Login first
    await act(async () => {
      screen.getByTestId("btn-login").click();
    });
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("a@b.com");
    });

    // Then logout
    act(() => {
      screen.getByTestId("btn-logout").click();
    });

    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("vip").textContent).toBe("false");
    expect(window.localStorage.getItem("supply_os_auth_user")).toBeNull();
  });

  // ── 6. refreshAuth() restores state ──
  it("refreshAuth() → refreshes user from API", async () => {
    const user = makeUser();
    let callCount = 0;
    server.use(
      http.post("/api/auth/login", () => {
        callCount++;
        return HttpResponse.json({ user });
      }),
      http.get("/api/auth/user", () => {
        callCount++;
        return HttpResponse.json({ user: { ...user, display_name: "Refreshed" } });
      })
    );

    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-login").click();
    });
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("a@b.com");
    });

    await act(async () => {
      screen.getByTestId("btn-refresh").click();
    });

    await waitFor(() => {
      expect(callCount).toBe(2);
    });
  });

  // ── 7. Init from localStorage ──
  it("initializes from localStorage on mount", async () => {
    const savedUser = makeUser({ email: "saved@test.com" });
    window.localStorage.setItem("supply_os_auth_user", JSON.stringify(savedUser));

    // MSW handler for refreshAuth call triggered by useEffect
    server.use(
      http.get("/api/auth/user", () => HttpResponse.json({ user: savedUser }))
    );

    renderAuth();

    // Should restore user from localStorage immediately
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("saved@test.com");
    });
  });

  // ── 8. isVip computed correctly ──
  it("isVip = true when membership_tier is 'vip'", async () => {
    const vipUser = makeUser({ membership_tier: "vip" });
    mockLoginSuccess(vipUser);
    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("vip").textContent).toBe("true");
    });
  });

  // ── 9. submitSupplierClaim when not logged in ──
  it("submitSupplierClaim() when not logged in → shows error message", async () => {
    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-claim").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("claim").textContent).toBe("请先登录后再绑定公司");
    });
  });

  // ── 10. submitSupplierClaim success ──
  it("submitSupplierClaim() success → shows claim message", async () => {
    const user = makeUser();
    mockLoginSuccess(user);
    server.use(
      http.post("/api/supplier-claims", () =>
        HttpResponse.json({ status: "pending_review" })
      )
    );
    renderAuth();

    // Login first
    await act(async () => {
      screen.getByTestId("btn-login").click();
    });
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("a@b.com");
    });

    // Submit claim
    await act(async () => {
      screen.getByTestId("btn-claim").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("claim").textContent).toContain("pending_review");
    });
  });

  // ── 11. refreshAuth when no user (no-op) ──
  it("refreshAuth() when not logged in → no API call", async () => {
    let apiCalled = false;
    server.use(
      http.get("/api/auth/user", () => {
        apiCalled = true;
        return HttpResponse.json({ user: makeUser() });
      })
    );
    renderAuth();

    await act(async () => {
      screen.getByTestId("btn-refresh").click();
    });

    // Wait a bit to ensure no async call happens
    await new Promise((r) => setTimeout(r, 100));
    expect(apiCalled).toBe(false);
  });

  // ── 12. register with claim parameter ──
  it("register() with claim → submits claim after registration", async () => {
    const user = makeUser({ email: "claim@test.com" });
    let claimCalled = false;
    server.use(
      http.post("/api/auth/register", () => HttpResponse.json({ user })),
      http.post("/api/supplier-claims", () => {
        claimCalled = true;
        return HttpResponse.json({ status: "submitted" });
      })
    );

    // Create a consumer that calls register with claim
    function ClaimRegisterConsumer() {
      const { register } = useAuth();
      return (
        <button
          data-testid="btn-register-claim"
          onClick={async () => {
            await register("claim@test.com", "pass", "ClaimUser", {
              companyName: "Claim Co",
              supplierType: "overseas",
              contactName: "Jane",
              contactPhone: "456",
              businessLicenseNo: "BL002",
            });
          }}
        >
          register-claim
        </button>
      );
    }

    render(
      <AuthProvider><ClaimRegisterConsumer /></AuthProvider>
    );

    await act(async () => {
      screen.getByTestId("btn-register-claim").click();
    });

    await waitFor(() => {
      expect(claimCalled).toBe(true);
    });
  });
});
