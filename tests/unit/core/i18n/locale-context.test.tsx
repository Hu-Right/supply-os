/**
 * LocaleContext 按需分包行为回归（2026-10 首屏改造 P0-1 配套）
 *
 * 钉住四件事（loader 以桩替换，真实懒加载链路见 loader.test.ts）：
 * 1. 初始只内联 zh：默认挂载即渲染中文文案，不触发任何语言包加载；
 * 2. 手动切换：setLocale("en") 先取包、就绪后才切 state 并写 Cookie；
 * 3. 挂载检测：cookie=fr 时自动拉 fr 包并切换；
 * 4. 失败保护：语言包加载失败 → 保持当前语言、不写 Cookie、switching 归位。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import enCommon from "@/core/i18n/locales/en/common.json";
import frCommon from "@/core/i18n/locales/fr/common.json";
import zhCommon from "@/core/i18n/locales/zh/common.json";

const mocks = vi.hoisted(() => ({
  loadLanguage: vi.fn(),
  isLanguageLoaded: vi.fn((_lang: string) => false),
}));

vi.mock("@/core/i18n/loader", () => ({
  loadLanguage: (...args: unknown[]) => mocks.loadLanguage(...args),
  isLanguageLoaded: (lang: string) => mocks.isLanguageLoaded(lang),
}));

import { LocaleProvider, useLocale } from "@/core/i18n/LocaleContext";

const COOKIE_NAME = "supply_os_locale";
const KEY = "homeHeroTitle";

function clearLocaleCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function getLocaleCookie(): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|;)\\s*${COOKIE_NAME}=([^;]*)`))?.[1];
}

function Probe() {
  const { t, setLocale, locale, switching } = useLocale();
  return (
    <div>
      <p data-testid="text">{t(KEY)}</p>
      <p data-testid="locale">{locale}</p>
      <p data-testid="switching">{String(switching)}</p>
      <button data-testid="to-en" onClick={() => setLocale("en" as never)}>to-en</button>
      <button data-testid="to-ar" onClick={() => setLocale("ar" as never)}>to-ar</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <LocaleProvider>
      <Probe />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  clearLocaleCookie();
  mocks.loadLanguage.mockReset();
  mocks.isLanguageLoaded.mockReset();
  mocks.isLanguageLoaded.mockReturnValue(false);
});

afterEach(clearLocaleCookie);

describe("LocaleContext（zh 静态 + 其余语言懒加载）", () => {
  it("默认挂载（cookie=zh）立即渲染中文，不加载任何语言包", () => {
    document.cookie = `${COOKIE_NAME}=zh; path=/`;
    renderProbe();
    expect(screen.getByTestId("text").textContent).toBe((zhCommon as Record<string, string>)[KEY]);
    expect(screen.getByTestId("locale").textContent).toBe("zh");
    expect(mocks.loadLanguage).not.toHaveBeenCalled();
  });

  it("setLocale(en)：语言包就绪后切英文，写 Cookie，switching 归位", async () => {
    mocks.loadLanguage.mockImplementation(async () => ({
      [KEY]: (enCommon as Record<string, string>)[KEY],
    }));
    document.cookie = `${COOKIE_NAME}=zh; path=/`; // 排除 jsdom navigator=en-US 的自动检测干扰
    renderProbe();

    await act(async () => {
      screen.getByTestId("to-en").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("text").textContent).toBe((enCommon as Record<string, string>)[KEY]);
    });
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("switching").textContent).toBe("false");
    expect(getLocaleCookie()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(mocks.loadLanguage).toHaveBeenCalledWith("en");
  });

  it("cookie=fr 挂载：自动拉 fr 包并切换", async () => {
    mocks.loadLanguage.mockImplementation(async () => ({
      [KEY]: (frCommon as Record<string, string>)[KEY],
    }));
    document.cookie = `${COOKIE_NAME}=fr; path=/`;
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("text").textContent).toBe((frCommon as Record<string, string>)[KEY]);
    });
    expect(screen.getByTestId("locale").textContent).toBe("fr");
    expect(mocks.loadLanguage).toHaveBeenCalledWith("fr");
  });

  it("语言包加载失败：保持当前语言、不写 Cookie、switching 归位", async () => {
    mocks.loadLanguage.mockRejectedValue(new Error("chunk dead"));
    document.cookie = `${COOKIE_NAME}=zh; path=/`;
    renderProbe();

    await act(async () => {
      screen.getByTestId("to-ar").click();
    });

    expect(screen.getByTestId("locale").textContent).toBe("zh");
    expect(screen.getByTestId("text").textContent).toBe((zhCommon as Record<string, string>)[KEY]);
    expect(screen.getByTestId("switching").textContent).toBe("false");
    // Cookie 必须仍是挂载时的 zh：失败的切换不得改写语言决议入口
    expect(getLocaleCookie()).toBe("zh");
  });

  it("已加载过的语言再次切换不再重复拉包（isLanguageLoaded 命中即直通）", async () => {
    mocks.loadLanguage.mockImplementation(async () => ({
      [KEY]: (enCommon as Record<string, string>)[KEY],
    }));
    document.cookie = `${COOKIE_NAME}=zh; path=/`;
    renderProbe();

    await act(async () => {
      screen.getByTestId("to-en").click();
    });
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("en"));

    // 模拟「已加载」状态后切走再切回：第二次不应再调 loadLanguage
    mocks.isLanguageLoaded.mockImplementation((lang: string) => lang === "en");
    await act(async () => {
      screen.getByTestId("to-ar").click();
    });
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("ar"));
    const callsForEnBefore = mocks.loadLanguage.mock.calls.filter((c) => c[0] === "en").length;
    await act(async () => {
      screen.getByTestId("to-en").click();
    });
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("en"));
    expect(mocks.loadLanguage.mock.calls.filter((c) => c[0] === "en").length).toBe(callsForEnBefore);
  });
});
