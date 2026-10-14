/**
 * 旧字典零残留门禁：src / scripts/tools / scripts/gates / tests / db/schema/baseline.sql
 * 不得再出现旧采购分类标准字样（unspsc，大小写不敏感）。
 *
 * 背景：UNSPSC 字典退役全役（§7~§12.3 + R2/R3 批次）完成后，防止旧字样从任何入口回潜——
 *   新代码、新注释、新测试、新基线都过这一道。
 *
 * 豁免清单走 .env（逗号分隔子串，按 行内容 匹配即豁免）：
 *   LEGACY_DICT_RESIDUE_EXEMPT=supplier.unspsc_codes_snapshot,supplier.unspsc_match_status,w_unspsc
 * 现存豁免均为「仍在库、由爬虫交集机制写入、代码零读写」的快照列，以及等待部署配对改名
 * 的 crm_reco_weight_profile.w_unspsc（deploy 后跑 legacy-dict-sweep-ddl.ts --renames-only
 * 即可摘除该豁免项）。
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
// 内置豁免（代码评审-controlled）：爬虫交集机制仍写入、代码零读写的供应商快照列。
// （w_unspsc 已随 2026-10-14 部署配对改名 w_commodity，豁免已摘除。）
// .env 的 LEGACY_DICT_RESIDUE_EXEMPT 只做本地追加，不覆盖此处。
const DEFAULT_EXEMPT = [
  "supplier.unspsc_codes_snapshot",
  "supplier.unspsc_match_status",
  // 快照列裸名（测试负向断言清单里不带表前缀出现）
  "unspsc_codes_snapshot",
  "unspsc_match_status",
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
const RE = /unspsc/i;

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
