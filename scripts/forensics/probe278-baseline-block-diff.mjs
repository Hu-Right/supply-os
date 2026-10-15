/**
 * probe278 · 重导基线前的「块级差异面」核查（只读，不连库、不写文件）
 *
 * 为什么要长期入库：本仓纪律是「baseline 的 commit 只带自己那张表的结构变化」。
 * 全库重导会顺手把别人的在途漂移（新增表 / 改列）塞进同一个 commit，让一次列精简
 * 背上不属于它的变更面（2026-10-15 就为此还原过一次全量重导）。
 * 所以移植前先问一句：**除我这张表外，还有哪些块不同？**
 *   ① 只在 fresh / 只在 committed → 源库与基线的表集合差异（多半属他人批次）；
 *   ② 两块都在但 DDL 不同 → 逐块给出「只在基线 / 只在源库」的行，判明哪些是我该带的。
 * 配套写路径：块级移植用 scripts/tools/baseline-transplant-block.mjs（带「除本块外一字节不得变」硬拦）。
 *
 * 用法：node scripts/forensics/probe278-baseline-block-diff.mjs [--committed=<路径>] [--fresh=<路径>]
 */
import { readFile } from "node:fs/promises";

const arg = (name, dft) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? dft;
const COMMITTED = arg("committed", "db/schema/baseline.sql");
const FRESH = arg("fresh", "runtime/baseline-fresh.sql"); // dump-schema-baseline 用 OUT= 导出的暂存
const MARK = "-- ── ";

function blocks(text) {
  const out = new Map();
  const re = new RegExp(`^${MARK}(.+?) ──$`, "gm");
  const hits = [];
  let m;
  while ((m = re.exec(text))) hits.push({ name: m[1], start: m.index });
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : text.length;
    out.set(h.name, text.slice(h.start, end).replace(/\s+$/, ""));
  });
  return out;
}

const a = blocks(await readFile(COMMITTED, "utf8"));
const b = blocks(await readFile(FRESH, "utf8"));
const onlyFresh = [...b.keys()].filter((t) => !a.has(t));
const onlyCommitted = [...a.keys()].filter((t) => !b.has(t));
const changed = [...b.keys()].filter((t) => a.has(t) && a.get(t) !== b.get(t));

console.log(`committed ${a.size} 块 · fresh ${b.size} 块`);
console.log(`只在 fresh（源库新增/基线未归档）：${onlyFresh.join(", ") || "无"}`);
console.log(`只在 committed（源库已消失）：${onlyCommitted.join(", ") || "无"}`);
console.log(`两块都在但 DDL 不同：${changed.join(", ") || "无"}`);
for (const t of changed) {
  const la = a.get(t).split("\n");
  const lb = b.get(t).split("\n");
  const setA = new Set(la.map((x) => x.trim()));
  const setB = new Set(lb.map((x) => x.trim()));
  console.log(`  ── ${t}`);
  console.log(`     只在基线：${la.filter((x) => !setB.has(x.trim())).map((x) => x.trim()).join(" | ") || "无"}`);
  console.log(`     只在源库：${lb.filter((x) => !setA.has(x.trim())).map((x) => x.trim()).join(" | ") || "无"}`);
}
// 除自己这张表外若还有别的块不同，那就不该被这次 baseline commit 带走
const mine = process.env.MY_TABLE;
if (mine) {
  const others = changed.filter((t) => t !== mine).concat([...onlyFresh, ...onlyCommitted].filter((t) => t !== mine));
  console.log(others.length ? `\n⚠ 除 ${mine} 外还有 ${others.length} 处不同（${others.join(", ")}）⇒ 只能做块级移植，不得全量覆盖` : `\n✅ 除 ${mine} 外无其他差异，块级移植与全量重导等价`);
}
