#!/usr/bin/env node
/**
 * 构建后 CSS 浏览器兼容门禁
 * Post-build CSS browser-compatibility gate
 *
 * 用法: node scripts/css-compat-gate.mjs [cssDir]
 * 示例: node scripts/css-compat-gate.mjs            # 默认扫描 .next/static
 *       node scripts/css-compat-gate.mjs .next/standalone/.next/static
 *
 * 背景：Tailwind v4 输出的 @layer / 原生嵌套 / oklch() / color-mix() 需要较新内核。
 * 手机百度 App 等旧 WebView 解析 @layer 会整段丢弃规则 → 整站无样式。
 * 构建期由 postcss-preset-env 降编译消除这些语法（见 postcss.config.mjs）。
 *
 * 本门禁在 `next build` 之后校验产物 CSS 确实被降级：
 *   硬失败：出现裸 @layer、oklch()/oklab()/lch()/lab() 颜色函数
 *           （命中即说明降编译未生效或被移除）。
 *   提示：仍存在的 color-mix() 应全部位于 @supports 守卫内（旧内核走回退色）。
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const cssDir = resolve(process.argv[2] || ".next/static");

if (!existsSync(cssDir)) {
  console.error(`✗ CSS 目录不存在: ${cssDir}（请先执行 npm run build）`);
  process.exit(1);
}

/** 递归收集 .css 文件（排除 .map） */
function collectCss(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectCss(full, acc);
    else if (entry.endsWith(".css")) acc.push(full);
  }
  return acc;
}

const files = collectCss(cssDir);
if (files.length === 0) {
  console.error(`✗ 未在 ${cssDir} 找到任何 .css 产物`);
  process.exit(1);
}

// 先剥离注释，避免 /* @layer */ 之类的文档/注释造成误报
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

let failed = false;
let totalColorMix = 0;
let totalSupportedColorMix = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf-8");
  const css = stripComments(raw);

  // 1) 裸 @layer —— 旧内核丢样式的头号元凶，必须为 0
  const layerHits = (css.match(/@layer\b/g) || []).length;
  // 2) 现代颜色函数 —— preset-env 应已转成 hex/rgb；注意 oklab 作为
  //    color-mix 参数出现时写作 "in oklab,"（无括号），不会被下面的 \( 匹配
  const colorFnRe = /(?<![-\w])(oklch|oklab|lch|lab)\(/g;
  const colorFnHits = (css.match(colorFnRe) || []).length;
  // 3) color-mix —— 统计总数与 @supports 守卫数（仅提示，不硬失败）
  const colorMixHits = (css.match(/color-mix\(/g) || []).length;
  const supportsGuardHits = (css.match(/@supports\s*\(\s*color:\s*color-mix/g) || []).length;

  totalColorMix += colorMixHits;
  totalSupportedColorMix += supportsGuardHits;

  const rel = file.replace(process.cwd() + "/", "").replace(/\\/g, "/");
  if (layerHits > 0) {
    console.error(`✗ ${rel}: 残留 @layer ×${layerHits}（降编译未生效）`);
    failed = true;
  }
  if (colorFnHits > 0) {
    console.error(`✗ ${rel}: 残留现代颜色函数 ×${colorFnHits}（oklch/oklab/lch/lab）`);
    failed = true;
  }
}

console.log("┌────────────────────────────────────┐");
console.log("│   构建后 CSS 浏览器兼容门禁         │");
console.log("├────────────────────────────────────┤");
console.log(`│ 扫描目录:  ${cssDir.replace(/\\/g, "/").slice(-24).padStart(24)}│`);
console.log(`│ CSS 文件数:${String(files.length).padStart(24)}│`);
console.log(`│ color-mix 总数:${String(totalColorMix).padStart(19)}│`);
console.log(`│  @supports 守卫:${String(totalSupportedColorMix).padStart(19)}│`);
console.log("└────────────────────────────────────┘");

if (failed) {
  console.error(
    "\n✗ 门禁不通过：产物 CSS 含旧内核（如手机百度）无法解析的语法。\n" +
      "  请检查 postcss.config.mjs 中 postcss-preset-env 是否仍生效、browsers 目标是否过新。",
  );
  process.exit(1);
}

console.log("\n✓ CSS 兼容门禁通过：@layer / 现代颜色函数均已降编译，旧内核可正常解析样式表。");
