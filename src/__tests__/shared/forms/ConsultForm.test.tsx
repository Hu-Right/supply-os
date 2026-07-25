import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ConsultForm } from "@/shared/forms/ConsultForm";

// Mock useLocale
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
  }),
}));

describe("ConsultForm", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 填齐全部必填字段（企业名/对接人/手机，required 对齐远端）
  const fillRequired = () => {
    fireEvent.change(screen.getByPlaceholderText("consultCompanyPlaceholder"), { target: { value: "Test Corp" } });
    fireEvent.change(screen.getByPlaceholderText("consultPersonPlaceholder"), { target: { value: "林经理" } });
    fireEvent.change(screen.getByPlaceholderText("consultPhonePlaceholder"), { target: { value: "13800138000" } });
  };

  it("renders form fields (remote-aligned layout)", () => {
    render(<ConsultForm onClose={onClose} />);
    expect(screen.getByText("consultTitle")).toBeInTheDocument();
    expect(screen.getByText("formConsultCompany")).toBeInTheDocument();
    expect(screen.getByText("consultFormContactName")).toBeInTheDocument();
    expect(screen.getByText("consultFormPhone")).toBeInTheDocument();
    expect(screen.getByText("formConsultNeeds")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();
    expect(screen.getByText("consultSubmitBtn")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(<ConsultForm onClose={onClose} />);
    // The close button is the first button (X icon)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when cancel button is clicked", () => {
    render(<ConsultForm onClose={onClose} />);
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("submits lead to /api/leads and shows booked view on 200", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<ConsultForm onClose={onClose} />);
    fillRequired();
    fireEvent.change(screen.getByPlaceholderText("consultNotesPlaceholder"), { target: { value: "医疗包装出海" } });

    fireEvent.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(screen.getByText("consultBookedTitle")).toBeInTheDocument();
    });
    expect(screen.getByText("consultBookedDesc")).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/leads",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toMatchObject({
      companyName: "Test Corp",
      contactPerson: "林经理",
      contactMethod: "13800138000",
      type: "consulting_advisor",
      industry: "Services",
    });
    expect(body.notes).toContain("[咨询顾问申请]");
    expect(body.notes).toContain("医疗包装出海");
  });

  it("auto-closes 2.2 seconds after successful submit", async () => {
    vi.useFakeTimers();
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<ConsultForm onClose={onClose} />);
    fillRequired();
    fireEvent.click(screen.getByText("consultSubmitBtn"));

    // 刷微任务让异步提交完成
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("consultBookedTitle")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error alert on failed submit", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<ConsultForm onClose={onClose} />);
    fillRequired();
    fireEvent.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled();
    });

    (window.alert as any).mockRestore();
  });
});
