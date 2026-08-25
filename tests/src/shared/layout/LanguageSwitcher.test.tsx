/**
 * shared/layout/LanguageSwitcher 组件测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSwitcher } from "@/shared/layout/LanguageSwitcher";

// 覆盖全局 i18n mock，支持可变 locale 以测试切换
let _locale = "en";
const _setLocale = vi.fn((code: string) => { _locale = code; });

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: _locale,
    setLocale: _setLocale,
    dir: "ltr",
  }),
  SUPPORTED_LOCALES: [
    { code: "zh", nativeName: "中文", englishName: "Chinese", dir: "ltr" },
    { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
    { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  ],
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    _locale = "en";
    _setLocale.mockClear();
  });

  it("显示当前语言名称", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("点击按钮 → 展开下拉", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("下拉显示所有支持语言", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("中文")).toBeInTheDocument();
    // "English" 同时出现在按钮和下拉中，用 getAllByText
    expect(screen.getAllByText("English").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Français")).toBeInTheDocument();
  });

  it("选择语言 → setLocale", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("中文"));
    expect(_setLocale).toHaveBeenCalledWith("zh");
  });

  it("ESC 关闭下拉", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("按钮有 aria-label", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "uiSelectLanguage");
  });

  it("aria-expanded 反映下拉状态", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
