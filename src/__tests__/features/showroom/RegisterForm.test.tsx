import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

  afterEach(() => {
    vi.useRealTimers();
  });

  // 填齐全部必填字段（含 mainProducts，required 属性对齐远端）
  const fillRequired = () => {
    fireEvent.input(screen.getByPlaceholderText("showroomCompanyPlaceholder"), { target: { value: "Test Corp" } });
    fireEvent.input(screen.getByPlaceholderText("showroomContactPlaceholder"), { target: { value: "John" } });
    fireEvent.input(screen.getByPlaceholderText("showroomPhonePlaceholder"), { target: { value: "13800138000" } });
    fireEvent.input(screen.getByPlaceholderText("mainProductsPlaceholder"), { target: { value: "医疗包装" } });
  };

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
    fillRequired();

    fireEvent.click(screen.getByText("submitRequestBtn"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
    // 对齐远端：成功后不立即关闭，3 秒后才触发 onSuccess
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("auto-closes 3 seconds after successful submission", async () => {
    vi.useFakeTimers();
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);

    fillRequired();

    fireEvent.click(screen.getByText("submitRequestBtn"));
    // 刷新微任务，让异步提交完成
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("formSuccess")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("adds a mock file when upload area clicked", () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByText("qualificationFile")).toBeInTheDocument();
    fireEvent.click(screen.getByText("uploadPlaceholder"));
    expect(screen.getByText("uploadMockSuccess")).toBeInTheDocument();
  });

  it("shows success state after submission", async () => {
    render(<RegisterForm selectedShowroom={null} onClose={onClose} onSuccess={onSuccess} />);

    fillRequired();

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

    fillRequired();

    fireEvent.click(screen.getByText("submitRequestBtn"));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
    // Should not show success on error
    expect(screen.queryByText("formSuccess")).toBeNull();
  });
});
