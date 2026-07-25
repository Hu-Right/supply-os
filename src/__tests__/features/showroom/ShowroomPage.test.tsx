import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShowroomPage from "@/features/showroom/pages/ShowroomPage";

// ── Mock data ──
vi.mock("@/data", () => ({
  EXHIBITION_HALLS: [
    { id: 1, nameZh: "中国展厅", nameEn: "China Hall", regionZh: "亚洲", regionEn: "Asia", countryZh: "中国", countryEn: "China", descriptionZh: "综合展会", descriptionEn: "General expo", city: "Beijing", startDate: "2026-01-01", endDate: "2026-01-10", venue: "Center", categories: [], tags: [] },
    { id: 2, nameZh: "德国展厅", nameEn: "Germany Hall", regionZh: "欧洲", regionEn: "Europe", countryZh: "德国", countryEn: "Germany", descriptionZh: "工业展", descriptionEn: "Industrial expo", city: "Berlin", startDate: "2026-02-01", endDate: "2026-02-10", venue: "Messe", categories: [], tags: [] },
    { id: 3, nameZh: "美国展厅", nameEn: "USA Hall", regionZh: "美洲", regionEn: "Americas", countryZh: "美国", countryEn: "USA", descriptionZh: "科技展", descriptionEn: "Tech expo", city: "NYC", startDate: "2026-03-01", endDate: "2026-03-10", venue: "Convention", categories: [], tags: [] },
  ],
}));

// ── Mock ShowroomCard ──
vi.mock("@/features/showroom/components/ShowroomCard", () => ({
  ShowroomCard: ({ showroom, onApply }: any) => (
    <div data-testid={`showroom-card-${showroom.id}`}>
      <span>{showroom.nameZh}</span>
      <button onClick={() => onApply(showroom)}>apply</button>
    </div>
  ),
}));

// ── Mock RegisterForm ──
vi.mock("@/features/showroom/components/RegisterForm", () => ({
  RegisterForm: ({ onClose }: any) => (
    <div data-testid="register-form">
      RegisterForm
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
  }),
  pickLocale: (_l: string, zh: string, _en: string) => zh,
}));

describe("ShowroomPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Region filter renders ──
  it("renders region filter with available regions", () => {
    render(<ShowroomPage />);

    // Region filter label
    expect(screen.getByText(/regionFilter/)).toBeInTheDocument();
    // All regions option
    expect(screen.getByText("allRegions")).toBeInTheDocument();
    // Region options
    expect(screen.getByText("亚洲")).toBeInTheDocument();
    expect(screen.getByText("欧洲")).toBeInTheDocument();
    expect(screen.getByText("美洲")).toBeInTheDocument();
  });

  // ── 2. Search filter ──
  it("filters showrooms by search term", () => {
    render(<ShowroomPage />);

    // All 3 cards visible initially
    expect(screen.getByTestId("showroom-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("showroom-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("showroom-card-3")).toBeInTheDocument();

    // Search for "中国"
    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "中国" } });

    // Only China Hall should remain
    expect(screen.getByTestId("showroom-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("showroom-card-2")).toBeNull();
    expect(screen.queryByTestId("showroom-card-3")).toBeNull();
  });

  // ── 3. Showroom cards render ──
  it("renders showroom cards from data", () => {
    render(<ShowroomPage />);

    expect(screen.getByTestId("showroom-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("showroom-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("showroom-card-3")).toBeInTheDocument();
  });

  // ── 4. Register form opens on apply ──
  it("opens register form when apply button clicked", () => {
    render(<ShowroomPage />);

    expect(screen.queryByTestId("register-form")).toBeNull();

    // Click apply on first card
    const card = screen.getByTestId("showroom-card-1");
    fireEvent.click(card.querySelector("button")!);

    expect(screen.getByTestId("register-form")).toBeInTheDocument();
  });

  // ── 5. Empty state when no match ──
  it("shows empty state when no showrooms match", () => {
    render(<ShowroomPage />);

    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "nonexistent_xyz" } });

    expect(screen.getByText("noData")).toBeInTheDocument();
  });

  // ── 6. Region filter narrows country list ──
  it("selecting region enables country filter", () => {
    render(<ShowroomPage />);

    // Country select should be disabled initially
    const countrySelect = screen.getAllByRole("combobox")[1];
    expect(countrySelect).toBeDisabled();

    // Select a region
    const regionSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(regionSelect, { target: { value: "亚洲" } });

    // Country select should now be enabled
    expect(countrySelect).not.toBeDisabled();
    // Should show China as option
    expect(screen.getByText("中国")).toBeInTheDocument();
  });
});
