/**
 * 硬编码凭据零残留门禁：连接配置里不得出现明文口令字面量。
 *
 * 背景（2026-10-30 实测）：本机一次性脚本区曾把开发库口令直接写进 89 个脚本
 *   （createConnection({ host:"127.0.0.1", port:3307, user:"root", password:"…" })）。
 *   凭据虽未进 git（runtime/temp 整目录被忽略），但一次重装/一台共享机就外泄，
 *   且并发会话会持续复制同一种写法——收敛完 5 分钟又冒出新violations。
 *   本门禁把「凭据从 .env 读」钉成红线：新增即当场拦下，而不是靠人自觉。
 *
 * 射程（两段，口径不同）：
 *   A 已跟踪代码：git ls-files ∩ 代码扩展名。CI 与本机都跑，命中即红。
 *   B 执行机临时脚本区：runtime/ temp/ scripts/ops|out|backups（都被 gitignore，CI 干净 clone 里不存在）。
 *     这些目录整体缺失 ⇒ 必是 CI，无从判生死，降为 WARN（沿用 check-gitignore-consistency 的 R5 约定）；
 *     本机装有这些目录 ⇒ 严格拦截，防呆职责归执行机的 lint / pre-push。
 *
 * 口径边界（都是实测逼出来的，勿随手放宽）：
 *   - 键族只认 password / passwd / pwd：曾按 token|secret|api_key 扫，已跟踪代码 25 处命中全是误伤
 *     （token: "PAYMENT_QR_CODE_MISSING" 是错误码、JWT_SECRET="test-…" 是测试、.env.example 是模板）。
 *   - 不扫 .json/.md/.sql：i18n 文案里的 "password" 是界面文字，不是凭据。
 *   - 占位值放行：值里成界出现 wrong/invalid/dummy/fake/test/your/my/example/
 *     placeholder/changeme/redacted 等「自声明非秘密」词，以及纯 * / 纯 x、<…> 与 $… 变量展开
 *     （模板与失败路径用例需要写样例值；真凭据形态如 temp…/123456/admin123 一律拦）。
 *   - 跳过任何 node_modules/.next 子树：temp/head-check/node_modules 是指向仓库根的 junction，
 *     第三方源码不是本仓红线，顺着它扫会淹掉真命中。
 *   - 输出打码（只留前 2 字符 + ***）：门禁自己不能把口令抄进终端与 CI 日志。
 *   - 靶子键名一律码位拼装：本文件与其自测都不出现连续明文（否则门禁自身即命中）。
 *
 * 用法：node scripts/gates/check-no-hardcoded-creds.mjs（exit 0 干净 / 1 有明文口令）
 *       CREDS_GATE_ROOT=<path>  把扫描根换到指定仓库（自测夹具用；默认 cwd）
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.CREDS_GATE_ROOT || process.cwd();
// 码位拼装：连续明文只出现在被检靶子，不出现在本文件
const KEYS = [["pass", "word"].join(""), ["pass", "wd"].join(""), ["p", "wd"].join("")];
// 引号字符类：反引号用 \u0060 写——直接写在模板串里会把模板字符串提前闭合（实测踩过，门禁整个解析失败）
const QCLS = "\"'\\u0060";
// 捕获组：1=键名 2=引号 3=档位值（同引号回指，避免单双引号交叉误匹）
const VALUE_RE = new RegExp(`\\b(${KEYS.join("|")})\\s*[:=]\\s*(["${QCLS}])([^${QCLS}]{4,})\\2`, "gi");
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sh|ps1)$/i;
// 「值自己声明不是秘密」：这些词必须以开头/结尾/-/_ 成界出现才算。
// 为什么不用逐行豁免表：实测已跟踪代码的 4 处命中全部是负例口令
// （password: "wrong" 与 "definitely-wrong-password"，认证失败路径的用例），
// 语义识别比 EXEMPT 白名单更紧：既不靠人工维护绕过面，也不给新漏洞留同一条后路。
// 反向验证：真开发口令（temp… 形式）、弱口令 123456、admin123 均不会被本表放行。
const NON_SECRET_HINT = /(^|[-_])(wrong|invalid|bogus|dummy|fake|notareal|placeholder|example|sample|test|your|my|redacted|changeme|change[-_]?me)([-_]|$)/i;
const SCRATCH_DIRS = ["runtime", "temp", "scripts/ops", "scripts/out", "scripts/backups"];

const masked = (v) => `${v.slice(0, 2)}${"*".repeat(Math.max(3, v.length - 2))}`;

function violationsOf(file, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    VALUE_RE.lastIndex = 0;
    let m;
    while ((m = VALUE_RE.exec(line))) {
      const value = m[3];
      if (NON_SECRET_HINT.test(value)) continue;
      if (/^[*xX..]+$/.test(value)) continue; // 纯掩码/占位串
      if (/^[<($]/.test(value)) continue; // 变量展开与模板占位（$DB_PASSWORD、<您的密码>）
      out.push(`${file}:${i + 1} 键=${m[1]} 值=${masked(value)}`);
    }
  });
  return out;
}

function walk(dir, out = []) {
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && CODE_EXT.test(e.name)) out.push(p);
  }
  return out;
}

const problems = [];
const warnings = [];

// —— 射程 A：已跟踪代码（CI 也跑这一段）——
const tracked = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((f) => CODE_EXT.test(f) && !f.endsWith(".example") && !f.includes("node_modules"));
for (const f of tracked) {
  const abs = join(ROOT, f);
  if (!existsSync(abs)) continue; // 工作区在途删除：既非命中也非死引用，跳过
  for (const v of violationsOf(f, readFileSync(abs, "utf8"))) problems.push(`A 已跟踪代码写明文口令：${v}`);
}

// —— 射程 B：执行机临时脚本区（gitignore，CI 里没有）——
const scratchPresent = SCRATCH_DIRS.filter((d) => existsSync(join(ROOT, d)));
if (!scratchPresent.length) {
  warnings.push("射程 B 跳过：本机无 runtime/temp/scripts-ops 等临时脚本区（CI 干净 clone），请在执行机跑本门禁复核");
} else {
  for (const d of scratchPresent) {
    for (const p of walk(join(ROOT, d))) {
      const rel = p.slice(ROOT.length + 1).split("\\").join("/");
      if (rel === "scripts/gates/check-no-hardcoded-creds.mjs") continue; // 自身是规则载体
      for (const v of violationsOf(rel, readFileSync(p, "utf8"))) problems.push(`B 临时脚本区写明文口令：${v}（改读 .env 的 DB_*，与 runtime/dbc.ts 同口径）`);
    }
  }
}

for (const w of warnings) console.log(`ℹ ${w}`);
if (problems.length) {
  console.error(`❌ 硬编码凭据门禁未通过（${problems.length} 处）：`);
  for (const p of problems) console.error("  - " + p);
  console.error("\n修复口径：凭据一律取 .env 的 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME，脚本里不写字面量口令。");
  process.exit(1);
}
console.log(`✅ 硬编码凭据门禁通过（射程 A ${tracked.length} 个跟踪代码文件 · 射程 B 临时区 ${scratchPresent.length ? scratchPresent.join(",") : "无（CI）"}）`);
