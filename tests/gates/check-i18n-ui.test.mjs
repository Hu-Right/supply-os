/**
 * 门禁自测：证明「UI 硬编码中文」守卫真的会拦，而不是永远绿。
 *
 * 存在理由：check-i18n.ts 只管「7 语言键集一致 + t("字面量") 有定义」，
 * 抓不到「组件里直接写死中文」——2026-11 审计时 74 个 .tsx 存在这类文案，
 * 原门禁全程放行。补上 AST 门禁后，这里用 fixture 钉住四条口径：
 *   1) JSX 文本 / 可见属性 / 对象字面量可见键里的中文必被拦；
 *   2) 同行 `i18n-allow` 显式豁免生效；
 *   3) SEO metadata 子树不在口径内；
 *   4) 纯中文注释不误报。
 * 最后一条「真实仓库当前干净」防止修好的存量再退化。
 *
 * 用法：node --test tests/gates/check-i18n-ui.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-i18n-ui.mjs");

/** 造 fixture 扫描根：files 的键是相对路径 */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "i18n-ui-gate-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf8");
  }
  return root;
}

function run(scanRoot) {
  const env = { ...process.env };
  if (scanRoot) env.I18N_UI_SCAN_ROOT = scanRoot;
  else delete env.I18N_UI_SCAN_ROOT;
  try {
    return { code: 0, out: execFileSync(process.execPath, [GATE], { encoding: "utf8", env }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
}

const roots = [];
function track(root) {
  roots.push(root);
  return root;
}
process.on("exit", () => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("JSX 文本里的中文被拦", () => {
  const root = track(fixture({
    "src/app/demo/page.tsx": `export default function Page() {\n  return <h1>采购机会</h1>;\n}\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /采购机会/);
  assert.match(out, /jsx-text/);
});

test("可见属性里的中文被拦", () => {
  const root = track(fixture({
    "src/features/demo/Foo.tsx": `export function Foo() {\n  return <input placeholder="请输入关键词" aria-label="搜索" />;\n}\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /attr:placeholder/);
  assert.match(out, /attr:aria-label/);
});

test("对象字面量的可见键中文被拦", () => {
  const root = track(fixture({
    "src/features/demo/options.tsx": `export const OPTIONS = [{ value: "a", label: "全部行业" }];\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /prop:label/);
});

test("同行 i18n-allow 豁免生效", () => {
  const root = track(fixture({
    "src/app/demo/page.tsx": `export default function Page() {\n  return <h1>云境·国际采购平台</h1>; // i18n-allow: 品牌专名\n}\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 0, out);
});

test("文件头 i18n-allow-file 整文件豁免生效", () => {
  const root = track(fixture({
    "src/app/legal/page.tsx": `// i18n-allow-file: 法律正文以中文版为准\nexport default function Page() {\n  return <p>隐私政策全文</p>;\n}\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 0, out);
});

test("SEO metadata 子树不在口径内", () => {
  const root = track(fixture({
    "src/app/demo/page.tsx":
      `import type { Metadata } from "next";\n` +
      `export const metadata: Metadata = { title: "采购需求发布", description: "一键发布采购需求" };\n` +
      `export default function Page() {\n  return <div />;\n}\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 0, out);
});

test("纯中文注释不误报", () => {
  const root = track(fixture({
    "src/app/demo/page.tsx": `// 这里全是中文注释\n/** 块注释也含中文 */\nexport default function Page() {\n  return <div />;\n}\n`,
  }));
  const { code, out } = run(root);
  assert.equal(code, 0, out);
});

test("真实仓库当前无硬编码中文 UI 文案", () => {
  const { code, out } = run();
  assert.doesNotMatch(out, /ENOENT/);
  assert.equal(code, 0, out);
});
