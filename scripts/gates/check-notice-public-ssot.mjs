import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：服务表 notice_public 单一写入者 + schema 单一事实源
 * @see ARCHITECTURE.md 红线 #6（宽表单一写入者）同族纪律
 *
 * 规则：
 *   N1) 只有 src/lib/services/notice-public/build.ts 可对 notice_public 执行
 *       INSERT/REPLACE/UPDATE/DELETE/TRUNCATE。其余任何代码手写刷服务表，都会与构建口径分叉
 *       （本项目已多次实测踩到「表↔builder 两套 DDL 打架」导致刷新链崩溃）。
 *       （2026-10-27 管道翻转：唯一写入者从 gitignore 的 ops 脚本迁入 src，仓库内可审、
 *       CI 全量生效；ops 的 notice-public-v2.ts 降级为 CLI 壳，不再含写语句。）
 *   N2) db/schema/baseline.sql 里 notice_public 的列集合，必须与 build.ts 的 PUBLIC_COLS
 *       一致；**已停写但列保留**的历史列（RETIRED_COLS）允许只存在于 baseline。
 *       手改表忘改 builder（或反之）= 漂移，此门禁当场拦截。
 *
 * 执行机感知：写入者与 COLS 均在 src（已跟踪），N1/N2 在 CI 干净 clone 全量生效，
 * 不再有「ops 目录缺失降级 SKIP」的形态。
 *
 * 违规 exit 1，供 lint / CI 拦截。扫描根可用 NP_SCAN_ROOT 覆盖（夹具测试用）。
 */
const ROOT = process.env.NP_SCAN_ROOT || process.cwd();
const TABLE = "notice_public";
const WRITER = "src/lib/services/notice-public/build.ts";
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "coverage", ".git"]);
const violations = [];

/**
 * 服务表「已停写、列保留」的历史列白名单。
 * 为什么允许 baseline 比 PUBLIC_COLS 多：
 *   - `industry_tree_code`：旧行业树快照列，读侧已无消费、服务表停写；同为历史保留。
 * 只允许这里列出的列；新增/未知的 baseline-only 列仍按漂移拦截。若退役列重新出现在
 * PUBLIC_COLS（回流写入），同样拦截。
 */
const RETIRED_COLS = new Set(["industry_tree_code"]);

/**
 * 服务表「生成列」自动豁免：baseline 里带 `GENERATED ALWAYS AS (...)` 的列由 MySQL
 * 自动计算、构建器不可写入（写值会直接报错），因此允许只存在于 baseline。
 * 2026-11-18 起：has_attachments（JSON_LENGTH(attachments) 的虚拟生成列 + 索引）。
 * 反向同样受管：生成列若出现在 PUBLIC_COLS（回流写入）按违规拦截。
 */
function isGeneratedColumnLine(l) {
  return /GENERATED\s+ALWAYS\s+AS/i.test(l);
}

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

/**
 * 从 baseline.sql 抽 notice_public 的列名集合，并识别其中的生成列
 * （GENERATED ALWAYS AS）。生成列由 MySQL 自动计算、构建器不可写入，
 * 因此允许只存在于 baseline（见下方 isGeneratedColumnLine 注释）。
 */
function baselineColumns() {
  const f = path.join(ROOT, "db", "schema", "baseline.sql");
  if (!fs.existsSync(f)) { violations.push("N2 找不到 db/schema/baseline.sql"); return null; }
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`CREATE TABLE .*\\\`${TABLE}\\\``, "i").test(l));
  if (start === -1) { violations.push(`N2 baseline.sql 未定义 ${TABLE}`); return null; }
  const cols = [];
  const generated = new Set();
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\)\s*ENGINE/i.test(l)) break;
    const m = /^\s*`([a-z0-9_]+)`\s+[a-z]/i.exec(l); // 反引号列名 + 空格 + 类型首字母
    if (m && !/^\s*(PRIMARY|UNIQUE|KEY|FULLTEXT|CONSTRAINT)\b/i.test(l)) {
      cols.push(m[1]);
      if (isGeneratedColumnLine(l)) generated.add(m[1]);
    }
  }
  return { cols, generated };
}

/** 从 build.ts 抽 PUBLIC_COLS 数组的列名集合 */
function builderColumns() {
  const f = path.join(ROOT, "src", "lib", "services", "notice-public", "build.ts");
  if (!fs.existsSync(f)) { violations.push("N2 找不到 src/lib/services/notice-public/build.ts"); return null; }
  const src = fs.readFileSync(f, "utf8");
  const block = /const\s+PUBLIC_COLS\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (!block) { violations.push("N2 build.ts 里找不到 PUBLIC_COLS 数组"); return null; }
  return [...block[1].matchAll(/"([a-z0-9_]+)"/gi)].map((m) => m[1]);
}

for (const dir of [path.join(ROOT, "src"), path.join(ROOT, "scripts")]) walk(dir);

const bInfo = baselineColumns();
const vCols = builderColumns();
const bCols = bInfo ? bInfo.cols : null;
const genCols = bInfo ? bInfo.generated : new Set();
if (bCols && vCols) {
  const b = new Set(bCols), v = new Set(vCols);
  const onlyBase = [...b].filter((c) => !v.has(c));
  const onlyBuild = [...v].filter((c) => !b.has(c));
  const unexpectedBase = onlyBase.filter((c) => !RETIRED_COLS.has(c) && !genCols.has(c));
  const retiredInBuild = [...RETIRED_COLS].filter((c) => v.has(c));
  const retained = onlyBase.filter((c) => RETIRED_COLS.has(c) && !genCols.has(c));
  const generatedRetained = onlyBase.filter((c) => genCols.has(c));
  const generatedInBuild = [...genCols].filter((c) => v.has(c));
  if (unexpectedBase.length || onlyBuild.length || retiredInBuild.length || generatedInBuild.length) {
    violations.push(
      `N2 schema 漂移：baseline(${b.size}列) vs v2 COLS(${v.size}列) 不一致` +
        `${unexpectedBase.length ? `\n     仅在 baseline（未登记退役列）: ${unexpectedBase.join(", ")}` : ""}` +
        `${onlyBuild.length ? `\n     仅在 v2 COLS: ${onlyBuild.join(", ")}` : ""}` +
        `${retiredInBuild.length ? `\n     退役列回流写入: ${retiredInBuild.join(", ")}` : ""}` +
        `${generatedInBuild.length ? `\n     生成列不得写入 PUBLIC_COLS（MySQL 自动计算）: ${generatedInBuild.join(", ")}` : ""}`,
    );
  }
  if (retained.length > 0 && violations.length === 0) {
    console.log(`  · 服务表历史保留列（build 停写、baseline 保留）：${retained.join(", ")}`);
  }
  if (generatedRetained.length > 0 && violations.length === 0) {
    console.log(`  · 服务表生成列（MySQL 自动计算、build 不写）：${generatedRetained.join(", ")}`);
  }
}

if (violations.length) {
  console.error(`✖ 违反服务表架构红线（${TABLE} 单一写入者 / schema 单一事实源）：`);
  for (const x of violations) console.error(`  - ${x}`);
  console.error(`  服务表内容由 ${WRITER} 唯一写入；改表结构须同步改 PUBLIC_COLS 与 baseline。`);
  process.exit(1);
}
const retainedCount = bCols && vCols
  ? bCols.filter((c) => !new Set(vCols).has(c) && RETIRED_COLS.has(c) && !genCols.has(c)).length
  : 0;
const generatedCount = bCols && vCols ? [...genCols].filter((c) => !new Set(vCols).has(c)).length : 0;
console.log(`✓ 服务表单一写入者与 schema 一致性检查通过（${bCols?.length} 列 = PUBLIC_COLS ${vCols?.length}` +
  `${retainedCount > 0 ? ` + 退役保留 ${retainedCount}` : ""}` +
  `${generatedCount > 0 ? ` + 生成列 ${generatedCount}` : ""}）`);
