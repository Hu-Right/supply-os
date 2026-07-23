import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes from "@/routes";

// Mock all lazy-loaded feature pages to simple markers
vi.mock("@/features/showroom", () => ({
  ShowroomPage: () => <div data-testid="page">ShowroomPage</div>,
}));
vi.mock("@/features/procurement", () => ({
  ProcurementPage: () => <div data-testid="page">ProcurementPage</div>,
}));
vi.mock("@/features/supplier", () => ({
  SupplierPage: () => <div data-testid="page">SupplierPage</div>,
}));
vi.mock("@/features/crm", () => ({
  CrmPage: () => <div data-testid="page">CrmPage</div>,
}));
vi.mock("@/features/services", () => ({
  ServicesPage: () => <div data-testid="page">ServicesPage</div>,
}));
vi.mock("@/features/learning", () => ({
  LearningPage: () => <div data-testid="page">LearningPage</div>,
}));
vi.mock("@/features/membership", () => ({
  MembershipPage: () => <div data-testid="page">MembershipPage</div>,
}));
vi.mock("@/features/training", () => ({
  TrainingPage: () => <div data-testid="page">TrainingPage</div>,
}));

// Mock useAuth for ProtectedRoute
const mockAuth = { authUser: null as any, isVip: false };
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

/** Helper: render AppRoutes at a given path */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("AppRoutes", () => {
  it("redirects / to /showroom", async () => {
    renderAt("/");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("ShowroomPage");
    });
  });

  it("renders ShowroomPage at /showroom", async () => {
    renderAt("/showroom");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("ShowroomPage");
    });
  });

  it("renders ProcurementPage at /procurement", async () => {
    renderAt("/procurement");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("ProcurementPage");
    });
  });

  it("renders SupplierPage at /supplier", async () => {
    renderAt("/supplier");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("SupplierPage");
    });
  });

  it("redirects /crm to /showroom when not authenticated", async () => {
    mockAuth.authUser = null;
    renderAt("/crm");
    // ProtectedRoute redirects to /showroom when not authenticated
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("ShowroomPage");
    });
  });

  it("renders CrmPage at /crm when authenticated", async () => {
    mockAuth.authUser = { user_key: "u1", email: "test@test.com" };
    renderAt("/crm");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("CrmPage");
    });
    mockAuth.authUser = null;
  });

  it("renders ServicesPage at /services", async () => {
    renderAt("/services");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("ServicesPage");
    });
  });

  it("renders LearningPage at /learning", async () => {
    renderAt("/learning");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("LearningPage");
    });
  });

  it("renders MembershipPage at /membership", async () => {
    renderAt("/membership");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("MembershipPage");
    });
  });

  it("renders TrainingPage at /training", async () => {
    renderAt("/training");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("TrainingPage");
    });
  });

  it("redirects unknown routes to /showroom", async () => {
    renderAt("/nonexistent");
    await waitFor(() => {
      expect(screen.getByTestId("page")).toHaveTextContent("ShowroomPage");
    });
  });
});
