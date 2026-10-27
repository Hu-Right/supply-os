/**
 * .gitignore 一致性门禁（根治「隐身携带 / npm 指向被忽略文件 / 散放脚本」三类问题）
 *
 * 断言（任一不满足即非零退出，进 lint / CI / pre-push）：
 *   R1  禁止「已跟踪却又被 .gitignore 命中」的隐身文件（clone 会丢、工具看不见）。
 *   R2  禁止跟踪一次性 / 生成物目录：scripts/ops、scripts/out、scripts/backups、runtime、temp、*.sync-watermark.json。
 *   R3  package.json 的 npm scripts 里引用的 scripts/** 文件必须已跟踪（杜绝换机 clone 跑不动）。
 *   R4  scripts/ 根不得散放脚本，必须归入 gates | tools | ops 之一。
 *   R5  入库代码/门禁/测试里写出的 `ops/<具体文件>` 类路径必须真实存在 ——
 *       引用仍在执行机的一次性件只 WARN（ADR-0010 明写那类脚本不入库），
 *       但文件已消失就是死指令，当场拦下（2026-10-19 实测：落点表门禁与 backbone-path
 *       让操作者去跑四个已删除的迁移件）。边界：docs/** 不受约束，那里是历史记录。
 *       R5 的判据只在执行机（有 scripts/ops/ 目录）上成立；CI 的 clone 里 ops 整目录
 *       按约定不存在，死/活无法分辨 ⇒ 降为 WARN，防呆职责归执行机的 lint/pre-push。
 *
 * 设计前提：.gitignore 采用「默认跟踪 scripts/gates|tools，仅忽略 ops/生成物」的分层模型，
 * 因此新增长期脚本无需再回来加白名单；放错目录 / 忘了跟踪都会在这里被当场拦下。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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

// R5：入库文件里指向一次性目录的具体脚本，必须真的存在于执行机上
// 判据只抓「死引用」：路径已写进代码/测试/门禁提示，但文件连本机都没了 ⇒ 那条指令无法执行（2026-10-19 抓到 4 个）。
// 引用了仍在 ops 的一次性件（ADR-0010 明写这些脚本不入库）只给 WARN：它是已知约定，不是破口。
// 扫描范围：src / scripts/gates / scripts/tools / tests（这些里的路径是给人和机器照着执行的）；
// docs 里的历史路径是证据，不拿它当破口。
// 执行机感知：ops 目录整体不存在 ⇒ 必是 CI 等干净 clone（一次性件按约定不入库），
// 那里「文件不存在」对所有 ops 引用恒真，死/活无从分辨，只能降为 WARN；
// 「已消失的死指令」由装有 ops 目录的执行机在 lint / pre-push 当场拦下。
const OPS_REF = /scripts\/(?:ops|out|backups)\/[\w.,{}-]+\.(?:ts|tsx|mjs|cjs|js|sh)/g;
const INSTRUCTION_SCOPES = [/^src\//, /^scripts\/gates\//, /^scripts\/tools\//, /^tests\//];
const opsDirPresent = ["scripts/ops", "scripts/out", "scripts/backups"].some((d) => existsSync(d));
const warnings = [];
for (const f of tracked) {
  if (!INSTRUCTION_SCOPES.some((re) => re.test(f))) continue;
  // 工作区在途删除（git 已跟踪、磁盘上还没）不得把门禁跑崩：它既非死引用也非活引用，跳过即可
  if (!existsSync(f)) continue;
  for (const h of new Set(readFileSync(f, "utf8").match(OPS_REF) ?? [])) {
    if (existsSync(h)) {
      warnings.push(`R5⚠ ${f} 指向未入库的一次性脚本 ${h}（仅本机可跑；若是长期件请归入 scripts/tools/）`);
    } else if (!opsDirPresent) {
      warnings.push(`R5⚠ ${f} 指向 ${h}：本机无 scripts/ops 目录（CI 干净 clone），无法判生死，不判红；请在执行机跑 npm run check:gitignore 复核`);
    } else {
      problems.push(`R5 死引用：${f} 让操作者去跑 ${h}，但该文件已不存在（长期件归入 scripts/tools/；一次性件已删则改成不带路径的历史叙述）`);
    }
  }
}

if (warnings.length) {
  console.log(`ℹ R5 提醒（不判红，已知的一次性件引用）：${warnings.length} 处`);
  for (const w of warnings) console.log("  " + w);
}

if (problems.length) {
  console.error("❌ .gitignore 一致性门禁未通过：");
  for (const p of problems) console.error("  - " + p);
  console.error("\n修复口径见本脚本头注释与 ARCHITECTURE.md「scripts 分层 / 测试分层」约定。");
  process.exit(1);
}

console.log("✅ .gitignore 一致性门禁通过（无隐身 / 无越界跟踪 / npm 引用均已入库 / scripts 无散放 / 入库文件无指向一次性目录的死引用）");
