/**
 * 旧字典零残留门禁：src / scripts/tools / scripts/gates 实现 / db/schema/baseline.sql
 * 不得再出现旧采购分类标准字样（大小写不敏感）。
 *
 * 背景：旧品目字典退役全役（§7~§12.3 + R2/R3 批次）完成后，防止旧字样从任何入口回潜——
 *   新代码、新注释、新测试、新基线都过这一道。
 *
 * 靶子字样不在本文件写明（否则门禁自身就是残留）：码位拼装 + 环境变量追加。
 *   LEGACY_DICT_RESIDUE_EXEMPT=<逗号分隔子串，按行内容匹配即豁免>
 * 内置豁免均为「仍在库、由爬虫交集机制写入、本仓代码零读写」的外部列；
 * 权重列已随 2026-10-14 部署配对改名，那条豁免已摘除。
 *
 * 用法：node scripts/gates/check-legacy-dict-residue.mjs（exit 0 = 干净 / 1 = 有残留）
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
// 门禁靶子：码位拼装，本仓文本层不出现连续旧字样
const LEGACY = ["un", "sp", "sc"].join("");
// 内置豁免（代码评审-controlled）：爬虫交集机制仍写入、本仓代码零读写的供应商快照列。
// .env 的 LEGACY_DICT_RESIDUE_EXEMPT 只做本地追加，不覆盖此处。
const DEFAULT_EXEMPT = [
  `supplier.${LEGACY}_codes_snapshot`,
  `supplier.${LEGACY}_match_status`,
  // 快照列裸名（测试负向断言清单里不带表前缀出现）
  `${LEGACY}_codes_snapshot`,
  `${LEGACY}_match_status`,
];
const EXEMPT = [
  ...DEFAULT_EXEMPT,
  ...(process.env.LEGACY_DICT_RESIDUE_EXEMPT ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean),
];
// 负向守卫行（测试/门禁里「断言其不存在」的用法）与门禁自测夹具不属残留
const NEGATIVE_RE = /not\.to(?:Match|Contain|HaveProperty|Be)/;

const ROOT = process.cwd();
// 射程 = 生产面（src / 库侧工具 / 门禁实现 / 结构基线）。tests/ 不进射程：测试里的
// 旧字样几乎全是「断言其不存在」的负向守卫与历史夹具，功能正确性由 vitest/CI 仲裁。
const SCOPES = ["src", join("scripts", "tools"), join("scripts", "gates")];
const FILES = ["db/schema/baseline.sql"];
const RE = new RegExp(LEGACY, "i");

const hits = [];
const SELF = "check-legacy-dict-residue";
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (p.includes(join("tests", "gates"))) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(name)) {
      if (p.includes(SELF)) continue;
      const content = readFileSync(p, "utf8");
      content.split(/\r?\n/).forEach((line, i) => {
        if (!RE.test(line)) return;
        if (EXEMPT.some((e) => line.includes(e))) return;
        if (NEGATIVE_RE.test(line) || /why:\s*["'`]/.test(line)) return;
        hits.push(`${p}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
  }
}
for (const s of SCOPES) walk(join(ROOT, s));
for (const f of FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (!RE.test(line)) return;
    if (EXEMPT.some((e) => line.includes(e))) return;
    hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
  });
}

if (hits.length) {
  console.error(`✗ 旧字典零残留门禁：${hits.length} 行命中（豁免清单 ${EXEMPT.length} 项）：`);
  for (const h of hits.slice(0, 30)) console.error("  · " + h);
  if (hits.length > 30) console.error(`  · …另有 ${hits.length - 30} 行`);
  process.exit(1);
}
console.log(`✓ 旧字典零残留门禁通过（扫描 src/scripts/tools/gates 实现/baseline，豁免 ${EXEMPT.length} 项）`);
