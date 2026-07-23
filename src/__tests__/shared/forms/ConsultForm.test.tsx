import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("renders form fields", () => {
    render(<ConsultForm onClose={onClose} />);
    expect(screen.getByText("consultFormTitle")).toBeInTheDocument();
    expect(screen.getByText("consultFieldName")).toBeInTheDocument();
    expect(screen.getByText("consultFieldEmail")).toBeInTheDocument();
    expect(screen.getByText("consultFieldPhone")).toBeInTheDocument();
    expect(screen.getByText("consultFieldMessage")).toBeInTheDocument();
    expect(screen.getByText("consultSubmitBtn")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(<ConsultForm onClose={onClose} />);
    // The close button is the first button (X icon)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("submits form and shows success on 200", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });

    render(<ConsultForm onClose={onClose} />);

    // Fill required fields: name, email, message
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "John" } });
    fireEvent.change(inputs[1], { target: { value: "john@test.com" } });
    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "Hello" } });

    // Submit
    fireEvent.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(screen.getByText("consultSubmitSuccess")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/consult", expect.objectContaining({
      method: "POST",
    }));
  });

  it("shows error alert on failed submit", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });
    vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<ConsultForm onClose={onClose} />);

    // Fill required fields and submit
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "John" } });
    fireEvent.change(inputs[1], { target: { value: "john@test.com" } });
    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "msg" } });

    fireEvent.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled();
    });

    (window.alert as any).mockRestore();
  });
});
