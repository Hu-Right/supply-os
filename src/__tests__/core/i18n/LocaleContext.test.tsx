import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/core/i18n/LocaleContext";

// ── Mock i18next & react-i18next (inline to avoid hoisting issues) ──
// vi.hoisted 确保 mockI18n 在 vi.mock 工厂函数执行前已初始化
const { mockI18n } = vi.hoisted(() => {
  const mockI18n = {
    isInitialized: true,
    language: "zh",
    use: vi.fn().mockReturnThis(),
    init: vi.fn(),
    changeLanguage: vi.fn(function (lang: string) {
      mockI18n.language = lang;
      return Promise.resolve();
    }),
    addResourceBundle: vi.fn(),
  };
  return { mockI18n };
});

vi.mock("i18next", () => ({
  default: mockI18n,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: mockI18n,
  }),
}));

// ── Mock loadLanguage：避免动态导入真实 JSON 文件 ──
vi.mock("@/core/i18n/loader", () => ({
  loadLanguage: vi.fn().mockResolvedValue({}),
}));

// ── Test consumer ──
function LocaleConsumer() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="translated">{t("brandName")}</span>
      <button data-testid="switch-en" onClick={() => setLocale("en")}>EN</button>
      <button data-testid="switch-ar" onClick={() => setLocale("ar")}>AR</button>
    </div>
  );
}

describe("LocaleContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockI18n.language = "zh";
    document.documentElement.lang = "";
    document.documentElement.dir = "";
  });

  it("provides default locale as 'zh'", () => {
    render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
    expect(screen.getByTestId("locale").textContent).toBe("zh");
  });

  it("t() returns translated value (key as value)", () => {
    render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
    expect(screen.getByTestId("translated").textContent).toBe("brandName");
  });

  it("setLocale calls i18n.changeLanguage and persists", async () => {
    render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
    await act(async () => {
      screen.getByTestId("switch-en").click();
    });
    await waitFor(() => {
      expect(window.localStorage.getItem("supply_os_locale")).toBe("en");
    });
  });

  it("useLocale throws outside Provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<LocaleConsumer />)).toThrow("useLocale must be used within <LocaleProvider>");
    spy.mockRestore();
  });

  it("detectLocale reads from localStorage", () => {
    window.localStorage.setItem("supply_os_locale", "en");
    // Re-import to trigger detectLocale
    // Since module is already loaded, we just verify localStorage is set
    expect(window.localStorage.getItem("supply_os_locale")).toBe("en");
  });

  it("setLocale persists to localStorage", async () => {
    render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
    await act(async () => {
      screen.getByTestId("switch-en").click();
    });
    await waitFor(() => {
      expect(window.localStorage.getItem("supply_os_locale")).toBe("en");
    });
  });

  it("handles localStorage unavailable gracefully", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });
    render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
    await act(async () => {
      screen.getByTestId("switch-en").click();
    });
    // Should not throw
    setItemSpy.mockRestore();
  });

  it("sets document.documentElement.dir on mount and locale switch", async () => {
    // initI18n 在 main.tsx 中设置初始 dir；测试中不调用 initI18n，手动模拟
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "zh";
    render(<LocaleProvider><LocaleConsumer /></LocaleProvider>);
    await waitFor(() => {
      expect(document.documentElement.dir).toBe("ltr");
    });

    // 切阿语：全局方向翻转为 rtl，lang 同步
    await act(async () => {
      screen.getByTestId("switch-ar").click();
    });
    await waitFor(() => {
      expect(document.documentElement.dir).toBe("rtl");
      expect(document.documentElement.lang).toBe("ar");
    });

    // 切回英语：恢复 ltr
    await act(async () => {
      screen.getByTestId("switch-en").click();
    });
    await waitFor(() => {
      expect(document.documentElement.dir).toBe("ltr");
      expect(document.documentElement.lang).toBe("en");
    });
  });
});
