#!/usr/bin/env node
/**
 * 构建后 CSS 浏览器兼容门禁
 * 用法: node scripts/css-compat-gate.mjs [cssDir]，默认 .next/static。
 * AST 检查层、嵌套、现代颜色及渐变参数的守卫和回退。
 * 本工具仅验证已声明的静态策略，不代替旧内核、JavaScript 或资源交付验收。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { analyzeCss } from "./lib/css-compat.mjs";

const cssDir = resolve(process.argv[2] || ".next/static");

if (!existsSync(cssDir)) {
  console.error(`✗ CSS 目录不存在: ${cssDir}（请先执行 npm run build）`);
  process.exit(1);
}

/** 递归收集 .css 文件（排除 .map） */
function collectCss(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectCss(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".css")) acc.push(full);
  }
  return acc;
}

const files = collectCss(cssDir);
if (files.length === 0) {
  console.error(`✗ 未在 ${cssDir} 找到任何 .css 产物`);
  process.exit(1);
}

const warnings = new Set();
let errorCount = 0;
let declarationCount = 0;
for (const file of files) {
  const result = analyzeCss(
    readFileSync(file, "utf8"),
    relative(process.cwd(), file).replace(/\\/g, "/")
  );
  for (const error of result.errors) console.error(`✗ ${error}`);
  for (const warning of result.warnings) warnings.add(warning);
  errorCount += result.errors.length;
  declarationCount += result.declarations;
}
console.log(
  `CSS 静态门禁：${files.length} 个文件，${declarationCount} 条声明，${errorCount} 项错误`
);
for (const warning of warnings) console.warn(`待真机验收：${warning}`);
if (errorCount > 0) {
  console.error("✗ CSS 静态门禁未通过，请检查降编译管线与渐进回退。");
  process.exitCode = 1;
} else {
  console.log("✓ 指定的 CSS 静态回退策略检查通过；不代表整站旧内核兼容或百度真机故障已解决。");
}
