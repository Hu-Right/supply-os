import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：服务表 crm_notice_public 单一写入者 + schema 单一事实源
 * @see ARCHITECTURE.md 红线 #6（宽表单一写入者）同族纪律
 *
 * 规则：
 *   N1) 只有 scripts/ops/notice-public-v2.ts 可对 crm_notice_public 执行
 *       INSERT/REPLACE/UPDATE/DELETE/TRUNCATE。其余任何代码手写刷服务表，都会与 v2 构建口径分叉
 *       （本项目已多次实测踩到「表↔builder 两套 DDL 打架」导致刷新链崩溃）。
 *   N2) db/schema/baseline.sql 里 crm_notice_public 的列集合，必须与 v2 的 COLS 集合
 *       完全一致。手改表忘改 builder（或反之）= 漂移，此门禁当场拦截。
 *
 * 执行机感知（口径同 check-gitignore-consistency R5）：v2 builder 落在 scripts/ops/，按分层约定不入库；
 * CI 干净 clone 里 ops 整目录缺失 ⇒ N2 的「baseline vs v2 COLS」无从判生死 ⇒ 降为 SKIP 不判红，
 * 防呆职责归装有 scripts/ops/ 的执行机（npm run lint / pre-push）。N1（越权写扫描）针对已跟踪的
 * src/、scripts/，在 CI 仍全量生效。
 *
 * 违规 exit 1，供 lint / CI 拦截。扫描根可用 NP_SCAN_ROOT 覆盖（夹具测试用）。
 */
const ROOT = process.env.NP_SCAN_ROOT || process.cwd();
const TABLE = "crm_notice_public";
const WRITER = "scripts/ops/notice-public-v2.ts";
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "coverage", ".git"]);
// ops 整目录缺失 ⇒ 必是 CI 等干净 clone（v2 按约定不入库），N2 builder 侧无从判定 ⇒ 降为 SKIP。
const OPS_DIR_PRESENT = fs.existsSync(path.join(ROOT, "scripts", "ops"));
const violations = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    if (SKIP_DIR.has(path.basename(target))) return;
    for (const item of fs.readdirSync(target)) walk(path.join(target, item));
    return;
  }
  if (!EXT.has(path.extname(target))) return;
  const rel = path.relative(ROOT, target).split(path.sep).join("/");
  if (rel === "scripts/gates/check-notice-public-ssot.mjs") return; // 本门禁自身
  const relNorm = rel.replace(/^\.\//, "");
  fs.readFileSync(target, "utf8").split(/\r?\n/).forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
  const writes =
    new RegExp("(INSERT\\s+INTO|REPLACE\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s*`?" + TABLE + "`?", "i").test(line);
    if (writes && relNorm !== WRITER) {
      violations.push(`N1 服务表单一写入者 → ${at}: ${line.trim()}`);
    }
  });
}

/** 从 baseline.sql 抽 crm_notice_public 的列名集合 */
function baselineColumns() {
  const f = path.join(ROOT, "db", "schema", "baseline.sql");
  if (!fs.existsSync(f)) { violations.push("N2 找不到 db/schema/baseline.sql"); return null; }
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`CREATE TABLE .*\\\`${TABLE}\\\``, "i").test(l));
  if (start === -1) { violations.push(`N2 baseline.sql 未定义 ${TABLE}`); return null; }
  const cols = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\)\s*ENGINE/i.test(l)) break;
    const m = /^\s*`([a-z0-9_]+)`\s+[a-z]/i.exec(l); // 反引号列名 + 空格 + 类型首字母
    if (m && !/^\s*(PRIMARY|UNIQUE|KEY|FULLTEXT|CONSTRAINT)\b/i.test(l)) cols.push(m[1]);
  }
  return cols;
}

/** 从 v2 抽 COLS 数组的列名集合 */
function builderColumns() {
  const f = path.join(ROOT, "scripts", "ops", "notice-public-v2.ts");
  if (!fs.existsSync(f)) { violations.push("N2 找不到 notice-public-v2.ts"); return null; }
  const src = fs.readFileSync(f, "utf8");
  const block = /const\s+COLS\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (!block) { violations.push("N2 v2 里找不到 COLS 数组"); return null; }
  return [...block[1].matchAll(/"([a-z0-9_]+)"/gi)].map((m) => m[1]);
}

for (const dir of [path.join(ROOT, "src"), path.join(ROOT, "scripts")]) walk(dir);

const bCols = baselineColumns();
const vCols = OPS_DIR_PRESENT ? builderColumns() : null;
if (bCols && vCols) {
  const b = new Set(bCols), v = new Set(vCols);
  const onlyBase = [...b].filter((c) => !v.has(c));
  const onlyBuild = [...v].filter((c) => !b.has(c));
  if (onlyBase.length || onlyBuild.length) {
    violations.push(
      `N2 schema 漂移：baseline(${b.size}列) vs v2 COLS(${v.size}列) 不一致` +
        `${onlyBase.length ? `\n     仅在 baseline: ${onlyBase.join(", ")}` : ""}` +
        `${onlyBuild.length ? `\n     仅在 v2 COLS: ${onlyBuild.join(", ")}` : ""}`,
    );
  }
}

if (violations.length) {
  console.error(`✖ 违反服务表架构红线（${TABLE} 单一写入者 / schema 单一事实源）：`);
  for (const x of violations) console.error(`  - ${x}`);
  console.error(`  服务表内容由 ${WRITER} 唯一写入；改表结构须同步改 v2 与 baseline。`);
  process.exit(1);
}
if (OPS_DIR_PRESENT) {
  console.log(`✓ 服务表单一写入者与 schema 一致性检查通过（${bCols?.length} 列，baseline==v2）`);
} else {
  console.log(
    `✓ 服务表单一写入者检查通过；CI 干净 clone 无 scripts/ops，v2↔baseline COLS 一致性在执行机校验（口径同 check:gitignore R5）`,
  );
}
