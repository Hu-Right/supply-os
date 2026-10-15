/**
 * crm_bid_notices 精简取证 · 静态引用全域扫描（可复跑判据入口）
 *
 * 判据口径对齐 scripts/tools/opp-slim-plan.mjs 的「一档」定义：
 *   src/ + scripts/ + tests/ 全域**词边界**扫描，snake 与 camel 双查均为 0 命中 → 才算云端零读写。
 *
 * 为什么不能只看「命中数」：同名列在 crm_bid_opportunities / crm_notice_search 上也存在
 * （thresholds / difficulty / is_qualified / documents / ai_products …），命中可能读的是
 * 兄弟表那一行；而 scripts/ops/*.sql 是历次删列前的 DDL 留底快照（回滚依据），不是读写方，
 * 混进来会让一列凭空多出 4 处「假引用」。所以本脚本：
 *   - 把命中分成 [代码] / [留底] 两类计数，只有代码类才算读写点；
 *   - 逐条吐出 file:line + 原文，归属由人工判定（宁缺毋滥）；
 *   - --assert-batch=N 时对第 N 批的待删列做硬断言：代码类命中必须为 0，否则 exit 1
 *     （防止「清障没做完就把阶段一跑起来」）。
 *
 * 用法：
 *   node scripts/tools/notices-slim-scan.mjs                 # 全量明细 → temp/notices-slim-scan.out.txt
 *   node scripts/tools/notices-slim-scan.mjs --assert-batch=1 # 只判批次一是否可进入
 * 只读：不连库、不改任何非 temp 文件。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { NOTICES_TABLE, dropColumnsOf, GUARDED_COLUMNS } from "./notices-slim-plan.mjs";
import { findNoticeRefSites } from "./lib/notices-ref-scan.mjs";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts", "tests"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "dist", "runtime", "temp"]);
const EXTS = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js"]);
const ASSERT_BATCH = (process.argv.find((a) => a.startsWith("--assert-batch=")) ?? "").split("=")[1];

/** 列清单唯一事实源：从 db/schema/baseline.sql 的 CREATE TABLE 块解析，不手抄（手抄会漂） */
function loadColumns() {
  const sql = readFileSync(join(ROOT, "db/schema/baseline.sql"), "utf8");
  const start = sql.indexOf(`CREATE TABLE \`${NOTICES_TABLE}\` (`);
  if (start < 0) throw new Error(`baseline.sql 里找不到 ${NOTICES_TABLE}`);
  const block = sql.slice(start, sql.indexOf("\n) ENGINE=", start));
  return [...block.matchAll(/^  `([a-z0-9_]+)`/gm)].map((m) => m[1]);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git" || SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXTS.has(name.slice(name.lastIndexOf(".")))) yield p;
  }
}

const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const cols = loadColumns();
const files = [];
for (const d of SCAN_DIRS) {
  try {
    for (const f of walk(join(ROOT, d))) files.push(f);
  } catch {
    /* 目录不存在则跳过 */
  }
}
// 本扫描器自身、清单与判据模块、作业脚本里必然出现这些列名，属自引用，不计入读写点
const SELF = [
  "scripts/tools/notices-slim-scan.mjs",
  "scripts/tools/notices-slim-plan.mjs",
  "scripts/tools/lib/notices-ref-scan.mjs",
  "scripts/tools/notices-shadow-phase1.mjs",
  "scripts/tools/notices-shadow-phase2-cutover.mjs",
  "scripts/gates/check-notices-slim.mjs",
];
const loaded = files
  .map((f) => ({ rel: relative(ROOT, f).replace(/\\/g, "/"), lines: readFileSync(f, "utf8").split(/\r?\n/) }))
  .filter((f) => !SELF.includes(f.rel));

const scan = (col) => {
  const camel = toCamel(col);
  // 不用 /g：只靠前后断言做词边界，test() 一次即够；带 /g 会遗留 lastIndex 造成隔行漏判
  const reSnake = new RegExp(`(?<![A-Za-z0-9_])${col}(?![A-Za-z0-9_])`);
  const reCamel = camel === col ? null : new RegExp(`(?<![A-Za-z0-9_])${camel}(?![A-Za-z0-9_])`);
  const hits = [];
  let codeN = 0;
  let snapN = 0;
  for (const { rel, lines } of loaded) {
    const isSnapshot = rel.endsWith(".sql"); // DDL 留底快照，不是读写方
    lines.forEach((line, i) => {
      if (!reSnake.test(line) && !(reCamel && reCamel.test(line))) return;
      if (isSnapshot) snapN++;
      else codeN++;
      hits.push(`    ${isSnapshot ? "[留底]" : "[代码]"} ${rel}:${i + 1} | ${line.trim().slice(0, 150)}`);
    });
  }
  return { col, camel, codeN, snapN, hits };
};

const results = cols.map(scan);
const byCol = new Map(results.map((r) => [r.col, r]));

if (ASSERT_BATCH) {
  // 硬断言走 lib/notices-ref-scan.mjs（与阶段一前置闸、防复活门禁同一实现），不用全文件命中数：
  // 后者会被兄弟表同名列（ai_products 在商机表也在用）、注释、以及本工具自己污染。
  const batch = Number(ASSERT_BATCH);
  const targets = dropColumnsOf(batch);
  if (targets.some((c) => !byCol.has(c))) {
    console.error("❌ 有待删列不在 baseline 里（结构已漂移或清单写错）");
    process.exit(1);
  }
  const sites = findNoticeRefSites(ROOT, targets, SCAN_DIRS, SELF);
  for (const c of targets) {
    const mine = sites.filter((s) => s.col === c);
    console.log(`  ${c.padEnd(18)} 本表读写点 ${mine.length} 处${mine.length ? "：" + mine.map((m) => `${m.file}×${m.count}`).join(", ") : ""}（全文件命中 ${byCol.get(c)?.codeN ?? 0}，含兄弟表同名列与注释噪声）`);
  }
  if (sites.length) {
    console.error(`\n❌ 批次 ${batch} 尚不可进入：这些列仍有本表读写点，先清障再跑阶段一`);
    for (const s of sites) console.error(`  - ${s.col} → ${s.file} ×${s.count}  ｜ ${s.sample.slice(0, 110)}`);
    process.exit(1);
  }
  console.log(`✅ 批次 ${batch} 静态判据通过（${targets.length} 列均无本表读写点）`);
  process.exit(0);
}

const out = [];
out.push(`===== ${NOTICES_TABLE} 精简取证（静态扫描）=====`);
out.push(`列数 ${cols.length} · 扫描文件 ${loaded.length} 个（${SCAN_DIRS.join(", ")}，已排除本工具自身与留底）`);
out.push(`口径：词边界匹配 + snake/camel 双查；[代码] 才是读写点，[留底] 是 DDL 快照；归属仍需逐条人工判定`);
out.push(`\n===== 命中汇总（按代码命中升序；★=当前批次待删列，▲=受保护列）=====`);
for (const r of [...results].sort((a, b) => a.codeN - b.codeN)) {
  const mark = dropColumnsOf().includes(r.col) ? "★" : Object.keys(GUARDED_COLUMNS).includes(r.col) ? "▲" : " ";
  out.push(`${mark} 代码 ${String(r.codeN).padStart(4)}  留底 ${String(r.snapN).padStart(3)}  ${r.col}`);
}
for (const r of results) {
  out.push(`\n── ${r.col}  (camel ${r.camel})  代码命中 ${r.codeN} / 留底命中 ${r.snapN}`);
  out.push(...(r.hits.length > 80 ? [...r.hits.slice(0, 80), `    …（截断，共 ${r.hits.length} 行）`] : r.hits.length ? r.hits : ["    （零命中）"]));
}
const text = out.join("\n") + "\n";
mkdirSync(join(ROOT, "temp"), { recursive: true });
writeFileSync(join(ROOT, "temp/notices-slim-scan.out.txt"), text, "utf8");
console.log(out.slice(0, 12).join("\n"));
console.log(`…\n完整明细：temp/notices-slim-scan.out.txt（共 ${results.length} 列，零代码命中 ${results.filter((r) => r.codeN === 0).length} 列）`);
