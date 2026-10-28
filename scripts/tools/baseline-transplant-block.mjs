/**
 * 结构基线的「块级移植」工具：只把指定表的 DDL 块从暂存导出覆盖进 db/schema/baseline.sql
 *
 * 为什么不用全量重导直接覆盖 baseline.sql：`dump-schema-baseline.mjs` 是从**现网全库**导出的，
 * 而现网同时有别人的在途结构漂移（新表未归档、旧表已消失、别张表改了列）。全量覆盖会让一次
 * 列精简的 baseline commit 背上不属于它的变更面 —— 2026-10-15 就为此 `git checkout --` 还原过一次。
 * 本工具把变更面钉死在「一张表」上，并**硬拦除本块外的一字节改动**（替换前后把两块都归一成同一
 * 占位符比对，不等就拒绝写出）。
 *
 * 只做本地文件写，不连库。导出的暂存由 dump 脚本生成：
 *   OUT=runtime/baseline-fresh.sql node --env-file=.env scripts/tools/dump-schema-baseline.mjs
 * 移植前建议先跑 scripts/forensics/probe278-baseline-block-diff.mjs 看清「除本表外还有哪些块不同」。
 *
 * 用法：
 *   node scripts/tools/baseline-transplant-block.mjs --table=bid_notices --fresh=runtime/baseline-fresh.sql
 *   加 --check 只比对不写文件（等价 dry-run）
 * @see docs/adr/0003（影子表蓝绿切换）与 scripts/tools/notices-slim-plan.mjs 头注「落库终态」
 */
import { readFile, writeFile } from "node:fs/promises";

const arg = (name, dft) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? dft;
const TABLE = arg("table", "");
const FRESH = arg("fresh", "runtime/baseline-fresh.sql");
const TARGET = arg("target", "db/schema/baseline.sql");
const CHECK = process.argv.includes("--check");
if (!TABLE) {
  console.error("❌ 必须带 --table=<表名>：本工具的设计前提就是「一次只带一张表」");
  process.exit(1);
}

const MARKER = `-- ── ${TABLE} ──`;
/** 取某表的整块（从节标题到下一个节标题或文件尾），与 dump 的分节写法一致 */
function blockOf(text) {
  const start = text.indexOf(MARKER);
  if (start < 0) throw new Error(`找不到块标记：${MARKER}`);
  const next = text.indexOf("\n-- ── ", start + MARKER.length);
  return text.slice(start, next < 0 ? text.length : next);
}
const colsOf = (b) => [...b.matchAll(/^  `([a-z0-9_]+)`/gm)].map((m) => m[1]);

const before = await readFile(TARGET, "utf8");
const fresh = await readFile(FRESH, "utf8");
const oldBlock = blockOf(before);
const newBlock = blockOf(fresh);
const oc = colsOf(oldBlock);
const nc = colsOf(newBlock);
console.log(`${TABLE}：基线 ${oc.length} 列 → 暂存 ${nc.length} 列`);
console.log(`  只在暂存（新增）：${nc.filter((c) => !oc.includes(c)).join(", ") || "无"}`);
console.log(`  只在基线（已退役）：${oc.filter((c) => !nc.includes(c)).join(", ") || "无"}`);

if (oldBlock === newBlock) {
  console.log("✓ 两段一致，未改写文件");
  process.exit(0);
}
const after = before.replace(oldBlock, newBlock);
// 硬拦：除本块外一个字节都不许变（防止在「移植」名义下顺手改了别的表）
const strip = (t) => t.replace(oldBlock, "«B»").replace(newBlock, "«B»");
if (strip(before) !== strip(after)) throw new Error(`除 ${TABLE} 块外出现了其他改动，拒绝写出`);
if (CHECK) {
  console.log(`✓ --check：本块可移植且块外零改动，未写文件`);
  process.exit(0);
}
await writeFile(TARGET, after, "utf8");
console.log(`✓ 已写出 ${TARGET}（仅 ${TABLE} 一块）`);
console.log("下一步：`git diff --stat -- db/schema/baseline.sql` 应只反映本块规模（列级改动通常为 ±1 行/列）。");
