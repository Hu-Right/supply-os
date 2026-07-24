import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegisterForm } from "@/features/showroom/components/RegisterForm";

// ── Mock dependencies ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_l: string, zh: string, _en: string) => zh,
}));

const mockSubmit = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/features/showroom/api", () => ({
  submitShowroomRegister: (...args: any[]) => mockSubmit(...args),
}));

const mockShowroom = {
  id: "sh-1",
  nameZh: "联合国展厅",
  nameEn: "UN Showroom",
  descriptionZh: "描述",
  descriptionEn: "Description",
  image: "/img.png",
  country: "国际",
} as any;

describe("RegisterForm", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({ success: true });
  });

  it("renders form fields", () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByPlaceholderText("showroomCompanyPlaceholder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("showroomContactPlaceholder")).toBeInTheDocument();
    expect(screen.getByText("submitRequestBtn")).toBeInTheDocument();
  });

  it("shows selected showroom name in title", () => {
    render(<RegisterForm selectedShowroom={mockShowroom} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByText("showroomApplyTitle")).toBeInTheDocument();
  });

  it("shows default title when no showroom selected", () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByText("showroomApplyDefault")).toBeInTheDocument();
  });

  it("validates required fields on submit", async () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText("submitRequestBtn"));
    // Should not submit without required fields
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("submits form with valid data", async () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);

    // Fill required fields
    fireEvent.input(screen.getByPlaceholderText("showroomCompanyPlaceholder"), { target: { value: "Test Corp" } });
    fireEvent.input(screen.getByPlaceholderText("showroomContactPlaceholder"), { target: { value: "John" } });
    fireEvent.input(screen.getByPlaceholderText("showroomPhonePlaceholder"), { target: { value: "13800138000" } });

    fireEvent.click(screen.getByText("submitRequestBtn"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows success state after submission", async () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.input(screen.getByPlaceholderText("showroomCompanyPlaceholder"), { target: { value: "Test Corp" } });
    fireEvent.input(screen.getByPlaceholderText("showroomContactPlaceholder"), { target: { value: "John" } });
    fireEvent.input(screen.getByPlaceholderText("showroomPhonePlaceholder"), { target: { value: "13800138000" } });

    fireEvent.click(screen.getByText("submitRequestBtn"));

    await waitFor(() => {
      expect(screen.getByText("formSuccess")).toBeInTheDocument();
    });
  });

  it("calls onClose when cancel button clicked", () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("handles submit error gracefully", async () => {
    mockSubmit.mockRejectedValueOnce(new Error("Network error"));
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.input(screen.getByPlaceholderText("showroomCompanyPlaceholder"), { target: { value: "Test Corp" } });
    fireEvent.input(screen.getByPlaceholderText("showroomContactPlaceholder"), { target: { value: "John" } });
    fireEvent.input(screen.getByPlaceholderText("showroomPhonePlaceholder"), { target: { value: "13800138000" } });

    fireEvent.click(screen.getByText("submitRequestBtn"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
    // Should not show success on error
    expect(screen.queryByText("formSuccess")).toBeNull();
  });
});
