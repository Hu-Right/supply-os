/**
 * i18n 懒加载器真实链路测试（不 mock，直接动态 import 真实 JSON）
 *
 * 覆盖 2026-10 分包改造的两处风险：
 * - loader.ts 的文件清单必须齐全（曾缺 errors.json，靠本测试暴露）；
 * - 同一语言第二次调用走 loaded 短路，返回空对象不重复拉包。
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

  it("已加载语言再次请求直接返回空对象（短路，不重复拉包）", async () => {
    const loader = await freshLoader();
    await loader.loadLanguage("es" as never);
    await expect(loader.loadLanguage("es" as never)).resolves.toEqual({});
  });
});
