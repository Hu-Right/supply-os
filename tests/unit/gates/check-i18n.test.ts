// @vitest-environment node
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * i18n 键一致性门禁的自测。
 *
 * 存在的理由是一次真实断链：门禁脚本被搬进 scripts/gates/ 时，它按自身位置回溯的
 * locales 相对路径没有跟着改（../src → ../../src），而本地只装了跑 tsc 的 pre-commit
 * 钩子、含 check-i18n 的 pre-push 链从未触发，CI 于是在 `npm run check-i18n` 当场
 * ENOENT 退出 1，把后面的测试/构建全部遮住。
 * 因此这里不只测「各语言键一致」这一业务口径，更要测「门禁自己还能找到自己的数据」。
 */
const REPO_ROOT = process.cwd();
const GATE = path.join(REPO_ROOT, "scripts/gates/check-i18n.ts");
const LOCALES = path.join(REPO_ROOT, "src/core/i18n/locales");
const LANGS = ["zh", "en", "fr", "ru", "es", "ar", "pt"];

function runGate() {
  // Node 24 原生剥离类型，无需经 tsx；CI 与本地同一入口
  const result = spawnSync(process.execPath, [GATE], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(result.error).toBeUndefined();
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("i18n 键一致性门禁", () => {
  it("门禁脚本按自身位置回溯的 locales 目录确实存在（防再次搬目录后相对路径失效）", () => {
    const src = fs.readFileSync(GATE, "utf8");
    const m = src.match(/resolve\(\s*dirname\(fileURLToPath\(import\.meta\.url\)\),\s*"([^"]+)"/);
    expect(m, "门禁未再以脚本自身位置回溯 locales，请同步调整本断言").not.toBeNull();
    const target = path.resolve(path.dirname(GATE), m![1]);
    expect(target).toBe(LOCALES);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("七语言目录齐备且各有 JSON 词包", () => {
    for (const lang of LANGS) {
      const dir = path.join(LOCALES, lang);
      expect(fs.existsSync(dir), `缺少语言包目录 ${lang}`).toBe(true);
      expect(fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length).toBeGreaterThan(0);
    }
  });

  /**
   * 加一门语言要同时动五处字面清单（pt 新增时实测发现）：本测试自己的 LANGS、
   * 门禁 LANGS、middleware 的 SUPPORTED_LOCALES、core/i18n/locales.ts 的注册表、
   * core/i18n/bundles.ts 的 SUPPORTED_LOCALE_CODES。漏一处就是静默不对称：
   * 漏 middleware → 新语言 cookie 被洗回 zh；漏 bundles → SSR 无该语言包；
   * 漏门禁 → 新语言包键漂移无人拦。类型层只钉得住 Record<Locale, …> 那些对象，
   * 钉不住这些数组/集合字面量，故在此从源码里抽出来对齐。
   */
  it("语言代码清单在五处源码里完全一致（防加语言漏改）", () => {
    const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    const quotedList = (rel: string, pattern: RegExp) => {
      const m = read(rel).match(pattern);
      expect(m, `${rel} 里找不到预期的语言清单，请同步调整本断言`).not.toBeNull();
      return [...m![1].matchAll(/"([a-z]{2})"/g)].map((x) => x[1]).sort();
    };

    const expected = [...LANGS].sort();
    const sources: Record<string, string[]> = {
      "scripts/gates/check-i18n.ts (LANGS)": quotedList(
        "scripts/gates/check-i18n.ts",
        /const LANGS\s*=\s*\[([^\]]+)\]/,
      ),
      "middleware.ts (SUPPORTED_LOCALES)": quotedList(
        "middleware.ts",
        /const SUPPORTED_LOCALES\s*=\s*\[([^\]]+)\]/,
      ),
      "src/core/i18n/types.ts (Locale)": quotedList(
        "src/core/i18n/types.ts",
        /export type Locale\s*=([^;]+);/,
      ),
      "src/core/i18n/bundles.ts (SUPPORTED_LOCALE_CODES)": quotedList(
        "src/core/i18n/bundles.ts",
        /export const SUPPORTED_LOCALE_CODES\s*=\s*\[([^\]]+)\]/,
      ),
    };
    for (const [where, codes] of Object.entries(sources)) {
      expect(codes, `${where} 与其余语言清单不一致`).toEqual(expected);
    }

    // 注册表是下拉框的唯一数据源（不是字面量数组，单独抽 code）
    const registry = [...read("src/core/i18n/locales.ts").matchAll(/\{\s*code:\s*"([a-z]{2})"/g)]
      .map((m) => m[1])
      .sort();
    expect(registry, "core/i18n/locales.ts 注册表与其余语言清单不一致").toEqual(expected);
  });

  it("在仓库根执行门禁 → 退出码 0 且不出现路径找不到", () => {
    const { code, output } = runGate();
    expect(output).not.toMatch(/ENOENT|no such file or directory/);
    expect(code).toBe(0);
  });
});
