import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ShowroomPage from "@/features/showroom/pages/ShowroomPage";

// ── Mock data ──
vi.mock("@/data", () => ({
  EXHIBITION_HALLS: [
    { id: 1, nameZh: "中国展厅", nameEn: "China Hall", regionZh: "亚洲", regionEn: "Asia", countryZh: "中国", countryEn: "China", descriptionZh: "综合展会", descriptionEn: "General expo", city: "Beijing", startDate: "2026-01-01", endDate: "2026-01-10", venue: "Center", categories: [], tags: [], bannerUrl: "/banner1.jpg", capacityValue: "5000㎡", featuredProductsZh: ["产品A"], featuredProductsEn: ["Product A"] },
    { id: 2, nameZh: "德国展厅", nameEn: "Germany Hall", regionZh: "欧洲", regionEn: "Europe", countryZh: "德国", countryEn: "Germany", descriptionZh: "工业展", descriptionEn: "Industrial expo", city: "Berlin", startDate: "2026-02-01", endDate: "2026-02-10", venue: "Messe", categories: [], tags: [], bannerUrl: "/banner2.jpg", capacityValue: "3000㎡", featuredProductsZh: ["产品B"], featuredProductsEn: ["Product B"] },
    { id: 3, nameZh: "美国展厅", nameEn: "USA Hall", regionZh: "美洲", regionEn: "Americas", countryZh: "美国", countryEn: "USA", descriptionZh: "科技展", descriptionEn: "Tech expo", city: "NYC", startDate: "2026-03-01", endDate: "2026-03-10", venue: "Convention", categories: [], tags: [], bannerUrl: "/banner3.jpg", capacityValue: "8000㎡", featuredProductsZh: ["产品C"], featuredProductsEn: ["Product C"] },
  ],
}));

// ── Mock ShowroomCard ──
vi.mock("@/features/showroom/components/ShowroomCard", () => ({
  ShowroomCard: ({ showroom, onApply, onConsult }: any) => (
    <div data-testid={`showroom-card-${showroom.id}`}>
      <span>{showroom.nameZh}</span>
      <button onClick={() => onApply(showroom)}>apply</button>
      <button onClick={() => onConsult(showroom)}>consult</button>
    </div>
  ),
}));

// ── Mock RegisterForm ──
vi.mock("@/features/showroom/components/RegisterForm", () => ({
  RegisterForm: ({ onClose, onSuccess }: any) => (
    <div data-testid="register-form">
      RegisterForm
      <button onClick={onClose}>close</button>
      <button onClick={onSuccess}>success</button>
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

// ── Mock events ──
const mockEmitAppEvent = vi.fn();
const eventListeners: Record<string, Function[]> = {};
vi.mock("@/core/events", () => ({
  onAppEvent: (event: string, handler: Function) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
    return () => {
      eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
    };
  },
  emitAppEvent: (...args: any[]) => mockEmitAppEvent(...args),
}));

describe("ShowroomPage — additional branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventListeners).forEach((k) => delete eventListeners[k]);
  });

  // ── 1. Reset filter clears all filters ──
  it("resets all filters when reset button clicked", async () => {
    render(<ShowroomPage />);

    // Apply some filters
    const regionSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(regionSelect, { target: { value: "亚洲" } });

    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "中国" } });

    // Reset button should appear
    await waitFor(() => {
      expect(screen.getByText("resetFilter")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("resetFilter"));

    // After reset, all 3 cards should be visible again
    expect(screen.getByTestId("showroom-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("showroom-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("showroom-card-3")).toBeInTheDocument();
    // Reset button should disappear
    expect(screen.queryByText("resetFilter")).toBeNull();
  });

  // ── 2. handleConsult emits app event ──
  it("emits consult event when consult button clicked on a card", async () => {
    render(<ShowroomPage />);

    const card = screen.getByTestId("showroom-card-1");
    const consultBtn = card.querySelectorAll("button")[1]; // second button = consult
    fireEvent.click(consultBtn);

    expect(mockEmitAppEvent).toHaveBeenCalledWith("supply-os:consult");
  });

  // ── 3. Register form overlay closes and resets selected showroom ──
  it("closes register form and resets showroom when close clicked", async () => {
    render(<ShowroomPage />);

    // Open register form
    const card = screen.getByTestId("showroom-card-1");
    fireEvent.click(card.querySelector("button")!);
    expect(screen.getByTestId("register-form")).toBeInTheDocument();

    // Close it
    fireEvent.click(screen.getByText("close"));
    expect(screen.queryByTestId("register-form")).toBeNull();
  });

  // ── 4. Register form onSuccess closes and resets ──
  it("closes register form on success callback", async () => {
    render(<ShowroomPage />);

    const card = screen.getByTestId("showroom-card-1");
    fireEvent.click(card.querySelector("button")!);
    expect(screen.getByTestId("register-form")).toBeInTheDocument();

    fireEvent.click(screen.getByText("success"));
    expect(screen.queryByTestId("register-form")).toBeNull();
  });

  // ── 5. App event opens register form ──
  it("opens register form when supply-os:open-showroom-register event fires", async () => {
    render(<ShowroomPage />);
    expect(screen.queryByTestId("register-form")).toBeNull();

    // Wait for useEffect to register the event listener
    await waitFor(() => {
      const handlers = eventListeners["supply-os:open-showroom-register"];
      expect(handlers).toBeDefined();
      expect(handlers.length).toBeGreaterThan(0);
    });

    // Simulate the app event wrapped in act for state updates
    await act(async () => {
      eventListeners["supply-os:open-showroom-register"][0]();
    });

    expect(screen.getByTestId("register-form")).toBeInTheDocument();
  });

  // ── 6. Country filter narrows results ──
  it("selecting country further narrows showroom results", async () => {
    render(<ShowroomPage />);

    // Select region first
    const regionSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(regionSelect, { target: { value: "亚洲" } });

    // Now country select should be enabled
    const countrySelect = screen.getAllByRole("combobox")[1];
    expect(countrySelect).not.toBeDisabled();

    // Select country
    fireEvent.change(countrySelect, { target: { value: "中国" } });

    // Only China hall should remain
    expect(screen.getByTestId("showroom-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("showroom-card-2")).toBeNull();
  });

  // ── 7. Region change resets country selection ──
  it("changing region resets country filter", async () => {
    render(<ShowroomPage />);

    const regionSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(regionSelect, { target: { value: "亚洲" } });

    const countrySelect = screen.getAllByRole("combobox")[1];
    fireEvent.change(countrySelect, { target: { value: "中国" } });

    // Change region again
    fireEvent.change(regionSelect, { target: { value: "欧洲" } });

    // Country should be reset
    expect(countrySelect).toHaveValue("");
  });

  // ── 8. Reset button only shows when at least one filter active ──
  it("does not show reset button when no filters are active", () => {
    render(<ShowroomPage />);
    expect(screen.queryByText("resetFilter")).toBeNull();
  });

  // ── 9. Reset button shows when only search term is set ──
  it("shows reset button when only search term is set", async () => {
    render(<ShowroomPage />);

    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "test" } });

    expect(screen.getByText("resetFilter")).toBeInTheDocument();
  });
});
