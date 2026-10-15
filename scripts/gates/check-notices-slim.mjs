/**
 * 公告主表精简守卫（crm_bid_notices 退役列不得复活）
 *
 * 规则：
 *   [NS1] 退役列名不得出现在「引用 crm_bid_notices 的 SQL」里（判定走
 *         scripts/tools/lib/notices-ref-scan.mjs，与取证/落刀前置闸同一实现）。
 *         列从库里消失后再被 SELECT 会直接报错而非静默变 null，所以这条必须硬拦。
 *         已登记的人工豁免（NOTICE_REF_WAIVERS，判据偏保守的商机侧误报）不算违规，
 *         但条数会打在成功行上——豁免不得静默成长，也不用担心它隐身。
 *   [NS2] 对「兄弟表 crm_bid_opportunities 没有同名列」的退役列，src/** 的任何代码行
 *         （剥离注释后）都不得再出现该名字——全域防复活，不留「先写进别处再拼回来」的缝。
 *         有同名列的（ai_products / is_qualified）不跑 NS2，否则会误伤合法的商机侧引用。
 *
 * 退役列清单：不另立一份手抄表，由 notices-slim-plan.mjs 的批次登记 + baseline.sql 现结构
 * 推导（「在册但已不在结构里」= 已退役）。⇒ 切换前本门禁自动空转，DROP 落库并重导
 * baseline 后自动上岗，无需人工维护「哪批已完成」的状态。
 *
 * 判据与执行方案：docs/数据库设计/crm_bid_notices-招标公告主表.md 与 scripts/tools/notices-slim-plan.mjs。
 * 违规 exit 1，进 npm run lint 与 CI。扫描根与基线文件可用环境变量覆盖（供自测夹具）：
 *   NOTICES_SLIM_SCAN_ROOT / NOTICES_SLIM_BASELINE
 */
import fs from "node:fs";
import path from "node:path";
import { retiredFrom, SIBLING_SAME_NAME_COLUMNS } from "../tools/notices-slim-plan.mjs";
import { scanNoticeRefs } from "../tools/lib/notices-ref-scan.mjs";

const ROOT = process.env.NOTICES_SLIM_SCAN_ROOT || process.cwd();
const BASELINE = process.env.NOTICES_SLIM_BASELINE || path.join(process.cwd(), "db/schema/baseline.sql");

/** 本工具与作业脚本必然提及列名，不算读写点（口径与 lib/notices-ref-scan.mjs 一致）。
 * 自测文件也在列：它的全部作用就是把退役列名当夹具嵌进去验证「真的会拦」，
 * 不排除它就会在列退役当天把门禁自己扫挂（2026-10-15 实跑撞到过：baseline 追平后
 * NS1 第一条报错就是本目录下的 fixture）——那类报错会让人以为门禁生效了，其实是自测在拦自己。 */
const SELF = [
  "scripts/tools/notices-slim-plan.mjs",
  "scripts/tools/notices-slim-scan.mjs",
  "scripts/tools/lib/notices-ref-scan.mjs",
  "scripts/tools/notices-shadow-phase1.mjs",
  "scripts/tools/notices-shadow-phase2-cutover.mjs",
  "scripts/gates/check-notices-slim.mjs",
  "tests/gates/check-notices-slim.test.mjs",
];

const RETIRED = retiredFrom(fs.readFileSync(BASELINE, "utf8"));
const HARD_BANNED = RETIRED.filter((c) => !SIBLING_SAME_NAME_COLUMNS.includes(c));

/**
 * 取代码行（剥离注释）。整行注释按行首标记判定；行内尾注释仅在「// 前是空白且行内无引号」
 * 时截断，避免把字符串里的 `https://` 当注释而漏检（同 check-opp-slim 口径）。
 */
function codeLines(text) {
  const kept = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === "" || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    const idx = raw.indexOf("//");
    const inline = idx > 0 && !raw.slice(0, idx).includes('"') && !raw.slice(0, idx).includes("'") && !raw.slice(0, idx).includes("`");
    kept.push(inline ? raw.slice(0, idx) : raw);
  }
  return kept;
}

const problems = [];

// NS1：本表 SQL 引用点复活（已登记的豁免进 waived，不进 problems）
const { sites: ns1, waived: ns1Waived } = scanNoticeRefs(ROOT, RETIRED, ["src", "scripts", "tests"], SELF);
for (const s of ns1) {
  problems.push(`[NS1] ${s.file}：引用了已退役列 \`${s.col}\`（${s.count} 处）→ ${s.sample.slice(0, 90)}`);
}

// NS2：无兄弟同名列的退役列，src 全域代码行不得再出现
const srcRoot = path.join(ROOT, "src");
const SKIP_DIR = new Set(["node_modules", ".next", "coverage", "dist"]);
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const rel = path.join(dir, name);
    const st = fs.statSync(rel);
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}
for (const file of walk(srcRoot, [])) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (SELF.includes(rel)) continue;
  for (const line of codeLines(fs.readFileSync(file, "utf8"))) {
    for (const col of HARD_BANNED) {
      if (new RegExp(`(?<![A-Za-z0-9_])${col}(?![A-Za-z0-9_])`).test(line)) {
        problems.push(`[NS2] ${rel}：全域引用了已退役列 \`${col}\` → ${line.trim().slice(0, 90)}`);
      }
    }
  }
}

if (problems.length) {
  console.error("❌ 公告主表精简守卫未通过：");
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  console.error("\n口径见 docs/数据库设计/crm_bid_notices-招标公告主表.md 与 scripts/tools/notices-slim-plan.mjs。");
  process.exit(1);
}
console.log(
  `✅ 公告主表精简守卫通过（在册待删 ${RETIRED.length} 列已退役并禁复活` +
    `${HARD_BANNED.length ? ` · 全域硬拦 ${HARD_BANNED.join(",")}` : " · 全域硬拦 0 列"}` +
    `${ns1Waived.length ? ` · 人工豁免 ${ns1Waived.length} 处（${[...new Set(ns1Waived.map((w) => w.col))].join(",")}）` : ""}` +
    "）",
);
