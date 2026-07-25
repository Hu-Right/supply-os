import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SessionBanner } from "@/shared/layout";

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// 路由探针：暴露当前 pathname 供导航断言
function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionBanner />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("SessionBanner", () => {
  it("renders showroom banner with badge, title, subtitle and register action", () => {
    renderAt("/showroom");
    expect(screen.getByText("SESSION ACTIVE STATUS")).toBeInTheDocument();
    expect(screen.getByText("showroomTitle")).toBeInTheDocument();
    expect(screen.getByText("showroomSubTitle")).toBeInTheDocument();
    expect(screen.getByText("registerShowroomBtn")).toBeInTheDocument();
    expect(screen.getByText("bookServiceNow")).toBeInTheDocument();
  });

  it("renders procurement banner with screening questionnaire action and no subtitle", () => {
    renderAt("/procurement");
    expect(screen.getByText("procurementNoticePoolTitle")).toBeInTheDocument();
    expect(screen.getByText("procurementScreeningBtn")).toBeInTheDocument();
    expect(screen.queryByText("showroomSubTitle")).toBeNull();
  });

  it.each([
    ["/supplier", "supplierMgmtTitle", "tabSupplierDesc"],
    ["/crm", "crmDashboard", "tabCrmDesc"],
    ["/services", "serviceEcoTitle", "ecosystemsSummary"],
    ["/learning", "learningTitle", "tabLearningDesc"],
    ["/membership", "membershipTitle", "tabMembershipDesc"],
  ])("renders %s banner with title and subtitle", (path, titleKey, descKey) => {
    renderAt(path);
    expect(screen.getByText(titleKey)).toBeInTheDocument();
    expect(screen.getByText(descKey)).toBeInTheDocument();
  });

  it("renders training banner and navigates back to /procurement", () => {
    renderAt("/training");
    expect(screen.getByText("trainingBannerTitle")).toBeInTheDocument();
    expect(screen.getByText("trainingBannerDesc")).toBeInTheDocument();
    fireEvent.click(screen.getByText("backToProcurement"));
    expect(screen.getByTestId("location")).toHaveTextContent("/procurement");
  });

  it("navigates to /training from the procurement screening action", () => {
    renderAt("/procurement");
    fireEvent.click(screen.getByText("procurementScreeningBtn"));
    expect(screen.getByTestId("location")).toHaveTextContent("/training");
  });

  it("dispatches supply-os:open-showroom-register from the showroom action", () => {
    const handler = vi.fn();
    window.addEventListener("supply-os:open-showroom-register", handler);
    renderAt("/showroom");
    fireEvent.click(screen.getByText("registerShowroomBtn"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("supply-os:open-showroom-register", handler);
  });

  it("dispatches supply-os:open-supplier-register from the supplier action", () => {
    const handler = vi.fn();
    window.addEventListener("supply-os:open-supplier-register", handler);
    renderAt("/supplier");
    fireEvent.click(screen.getByText("registerSupplierBtn"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("supply-os:open-supplier-register", handler);
  });

  it("dispatches supply-os:consult from the persistent consult action", () => {
    const handler = vi.fn();
    window.addEventListener("supply-os:consult", handler);
    renderAt("/crm");
    fireEvent.click(screen.getByText("bookServiceNow"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("supply-os:consult", handler);
  });

  it("treats the root path as the showroom banner", () => {
    renderAt("/");
    expect(screen.getByText("showroomTitle")).toBeInTheDocument();
    expect(screen.getByText("registerShowroomBtn")).toBeInTheDocument();
  });
});
