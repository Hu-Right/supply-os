/**
 * .gitignore 一致性门禁（根治「隐身携带 / npm 指向被忽略文件 / 散放脚本」三类问题）
 *
 * 断言（任一不满足即非零退出，进 lint / CI / pre-push）：
 *   R1  禁止「已跟踪却又被 .gitignore 命中」的隐身文件（clone 会丢、工具看不见）。
 *   R2  禁止跟踪一次性 / 生成物目录：scripts/ops、scripts/out、scripts/backups、runtime、temp、*.sync-watermark.json。
 *   R3  package.json 的 npm scripts 里引用的 scripts/** 文件必须已跟踪（杜绝换机 clone 跑不动）。
 *   R4  scripts/ 根不得散放脚本，必须归入 gates | tools | ops 之一。
 *
 * 设计前提：.gitignore 采用「默认跟踪 scripts/gates|tools，仅忽略 ops/生成物」的分层模型，
 * 因此新增长期脚本无需再回来加白名单；放错目录 / 忘了跟踪都会在这里被当场拦下。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const tracked = git(["ls-files"]);
const trackedSet = new Set(tracked);
const problems = [];

// R1：跟踪却又被忽略 = 隐身携带
for (const f of git(["ls-files", "-i", "-c", "--exclude-standard"])) {
  problems.push(`R1 隐身文件（已跟踪却被 .gitignore 命中，应删规则或停止跟踪）：${f}`);
}

// R2：一次性 / 生成物目录不应出现在跟踪清单
const NEVER_TRACKED = [
  /^scripts\/ops\//,
  /^scripts\/out\//,
  /^scripts\/backups\//,
  /^runtime\//,
  /^temp\//,
  /\.sync-watermark\.json$/,
];
for (const f of tracked) {
  if (NEVER_TRACKED.some((re) => re.test(f))) {
    problems.push(`R2 不应被跟踪（一次性 / 生成物）：${f}`);
  }
}

// R3：npm scripts 引用的 scripts/** 路径必须已跟踪
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const referenced = new Set();
for (const cmd of Object.values(pkg.scripts || {})) {
  for (const m of String(cmd).matchAll(/scripts\/[\w./-]+\.(?:ts|tsx|mjs|cjs|js|sh)/g)) {
    referenced.add(m[0]);
  }
}
for (const ref of referenced) {
  if (!trackedSet.has(ref)) {
    problems.push(`R3 npm 脚本引用了未跟踪文件（换机 clone 将跑不动）：${ref}（若为一次性脚本请放 scripts/ops/ 并从 npm scripts 移除）`);
  }
}

// R4：scripts 根禁止散放脚本（须归入 gates | tools | ops）
for (const f of tracked) {
  if (/^scripts\/[^/]+\.(ts|tsx|mjs|cjs|js|sh|cmd)$/.test(f)) {
    problems.push(`R4 脚本散放在 scripts/ 根，应归入 scripts/gates|tools|ops：${f}`);
  }
}

if (problems.length) {
  console.error("❌ .gitignore 一致性门禁未通过：");
  for (const p of problems) console.error("  - " + p);
  console.error("\n修复口径见本脚本头注释与 ARCHITECTURE.md「scripts 分层 / 测试分层」约定。");
  process.exit(1);
}

console.log("✅ .gitignore 一致性门禁通过（无隐身 / 无越界跟踪 / npm 引用均已入库 / scripts 无散放）");
