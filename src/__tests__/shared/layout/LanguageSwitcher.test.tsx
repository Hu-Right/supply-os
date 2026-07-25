import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSwitcher } from "@/shared/layout/LanguageSwitcher";

const setLocale = vi.fn();
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ locale: "zh", setLocale, t: (k: string) => k }),
  SUPPORTED_LOCALES: [
    { code: "zh", nativeName: "中文", englishName: "Chinese", dir: "ltr" },
    { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
    { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
    { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
    { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
    { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  ],
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => setLocale.mockClear());

  it("renders current locale native name and is collapsed by default", () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole("button", { name: /select language/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("中文");
  });

  it("opens the dropdown and lists 6 languages", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("selects a language and closes", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    fireEvent.click(screen.getByText("Français"));
    expect(setLocale).toHaveBeenCalledWith("fr");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /select language/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
