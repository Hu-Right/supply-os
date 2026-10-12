/**
 * 机会表精简守卫（crm_bid_opportunities 退役列不得复活）
 *
 * 规则：
 *   [OS1] 退役契约符号不得再出现在 src 代码里：`intl_procurement` / `INTL_PROCUREMENT` /
 *         `IntlProcurement`（注意 CRM 侧 `hasIntlProcurement` 是另一回事，不在禁止范围）。
 *   [OS2] 机会表读取点（SELECT 清单所在文件）的代码行不得再引用任何已退役列名——
 *         列在影子表精简后从库里消失，再被 SELECT 会直接报错而非静默 null，所以这条必须硬拦。
 *
 * 退役列清单唯一事实源：scripts/tools/opp-slim-plan.mjs（本门禁直接 import，不复制第二份）。
 * 判据与执行方案：docs/数据库设计/crm_bid_opportunities-投标商机表.md。
 *
 * 违规 exit 1，进 npm run lint 与 CI。扫描根可用 OPP_SLIM_SCAN_ROOT 覆盖（供自测夹具使用）。
 */
import fs from "node:fs";
import path from "node:path";
import { DROP_COLUMNS } from "../tools/opp-slim-plan.mjs";

const ROOT = process.env.OPP_SLIM_SCAN_ROOT || process.cwd();

/** 退役契约符号（OS1）：出现在任何 src 代码行即违规 */
const BANNED_SYMBOLS = [/intl_procurement\b/, /INTL_PROCUREMENT/, /\bIntlProcurement\b/];

/** 机会表读取点（OS2）：全库只有这几处 SELECT 该表列，退役列名出现在代码行即违规 */
const READ_SITES = [
  "src/lib/services/notices/featured.ts",
  "src/lib/services/notices/index.ts",
  "src/lib/repos/opportunities.repo.ts",
  "src/lib/services/open-api/engineering.ts",
  "src/lib/services/ai-summary/index.ts",
  "src/lib/services/ai/shared/notice-context.ts",
  "src/lib/services/search-sync/wide-row-builder.ts",
  "src/lib/services/search-sync/wide-fingerprint.ts",
  "src/lib/services/search-sync/crawler-sync-sql.ts",
  "src/lib/services/bid-report/merge.ts",
  "scripts/tools/daily-sync.cjs",
];

const EXT = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js"]);
const SKIP_DIR = new Set(["node_modules", ".next", "coverage"]);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const rel = path.join(dir, name);
    const st = fs.statSync(rel);
    if (st.isDirectory()) walk(rel, out);
    else if (EXT.has(path.extname(name))) out.push(rel);
  }
  return out;
}

/**
 * 取代码行（剥离注释）。
 * 整行注释按行首标记判定；行内尾注释仅在「// 前是空白且行内无 URL」时截断，
 * 避免把字符串里的 `https://` 当注释而漏检。
 */
function codeLines(text) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === "" || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    const idx = raw.indexOf("//");
    const inline = idx > 0 && !raw.slice(0, idx).includes('"') && !raw.slice(0, idx).includes("'") && !raw.slice(0, idx).includes("`");
    kept.push(inline ? raw.slice(0, idx) : raw);
  }
  return kept;
}

const problems = [];

// OS1：src 全域扫描退役符号
const srcRoot = path.join(ROOT, "src");
for (const file of walk(srcRoot, [])) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  for (const line of codeLines(fs.readFileSync(file, "utf8"))) {
    for (const re of BANNED_SYMBOLS) {
      if (re.test(line)) problems.push(`[OS1] ${rel}：退役契约符号复活 ${re} → ${line.trim().slice(0, 90)}`);
    }
  }
}

// OS2：读取点扫描退役列名
const colRes = DROP_COLUMNS.map((c) => ({ col: c, re: new RegExp(`\\b${c}\\b`) }));
for (const rel of READ_SITES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue; // 夹具根可能只放了部分文件
  for (const line of codeLines(fs.readFileSync(abs, "utf8"))) {
    for (const { col, re } of colRes) {
      if (re.test(line)) problems.push(`[OS2] ${rel}：引用了已退役列 \`${col}\` → ${line.trim().slice(0, 90)}`);
    }
  }
}

if (problems.length) {
  console.error("❌ 机会表精简守卫未通过：");
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  console.error("\n口径见 docs/数据库设计/crm_bid_opportunities-投标商机表.md 与 scripts/tools/opp-slim-plan.mjs。");
  process.exit(1);
}
console.log(`✅ 机会表精简守卫通过（退役列 ${DROP_COLUMNS.length} 个 · 读取点 ${READ_SITES.length} 处 · src 文件 ${walk(srcRoot, []).length} 个）`);
