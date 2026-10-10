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
 * 因此这里不只测「六语言键一致」这一业务口径，更要测「门禁自己还能找到自己的数据」。
 */
const REPO_ROOT = process.cwd();
const GATE = path.join(REPO_ROOT, "scripts/gates/check-i18n.ts");
const LOCALES = path.join(REPO_ROOT, "src/core/i18n/locales");
const LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

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

  it("六语言目录齐备且各有 JSON 词包", () => {
    for (const lang of LANGS) {
      const dir = path.join(LOCALES, lang);
      expect(fs.existsSync(dir), `缺少语言包目录 ${lang}`).toBe(true);
      expect(fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length).toBeGreaterThan(0);
    }
  });

  it("在仓库根执行门禁 → 退出码 0 且不出现路径找不到", () => {
    const { code, output } = runGate();
    expect(output).not.toMatch(/ENOENT|no such file or directory/);
    expect(code).toBe(0);
  });
});
