/**
 * i18n 懒加载器真实链路测试（不 mock，直接动态 import 真实 JSON）
 *
 * 覆盖两处风险：
 * - loader.ts 的文件清单必须齐全（曾缺 errors.json，靠本测试暴露）；
 * - 同一语言第二次调用必须命中缓存：不重复拉包，且返回**同一份词包**。
 *
 * 2026-11 语义变更（i18n 覆盖整改）：
 *   原实现命中缓存返回 `{}`，要求调用方先查 isLanguageLoaded 才能拿到资源。
 *   global-error 这类**没有 LocaleProvider** 的顶栏错误页只能直接调 loadLanguage，
 *   命中缓存时拿到空对象 → 错误页裸键。现改为返回缓存的合并词包，
 *   本测试据此断言「两次调用结果相同且非空」。
 */
import { describe, expect, it, vi } from "vitest";

type LoaderModule = typeof import("@/core/i18n/loader");

async function freshLoader(): Promise<LoaderModule> {
  vi.resetModules();
  return await import("@/core/i18n/loader");
}

describe("loadLanguage（真实 JSON 动态 import）", () => {
  it("ar 包合并后含 common 与 errors 两类键（清单完整性）", async () => {
    const loader = await freshLoader();
    const merged = await loader.loadLanguage("ar" as never);
    expect(merged["homeHeroTitle"]).toBeTruthy(); // common.json
    // errors.json 的键形如 err_*：确认清单里真的并入了该文件
    expect(Object.keys(merged).some((k) => k.startsWith("err"))).toBe(true);
    expect(loader.isLanguageLoaded("ar" as never)).toBe(true);
  });

  it("已加载语言再次请求返回同一份词包（命中缓存，不重复拉包）", async () => {
    const loader = await freshLoader();
    const first = await loader.loadLanguage("es" as never);
    const second = await loader.loadLanguage("es" as never);
    expect(second).not.toEqual({});
    // 同一引用即同一份缓存对象
    expect(second).toBe(first);
    expect(loader.getLoadedLanguage("es" as never)).toBe(first);
  });

  it("未加载语言 getLoadedLanguage 返回 undefined（不触发加载）", async () => {
    const loader = await freshLoader();
    expect(loader.getLoadedLanguage("ru" as never)).toBeUndefined();
    expect(loader.isLanguageLoaded("ru" as never)).toBe(false);
  });

  it("ui.json 已并入合并词包（新增命名空间接线完整性）", async () => {
    const loader = await freshLoader();
    const merged = await loader.loadLanguage("en" as never);
    expect(merged["uiRetry"]).toBeTruthy();
  });
});
