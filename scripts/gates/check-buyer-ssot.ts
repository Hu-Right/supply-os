/**
 * 门禁 BSS：机构归一「buyer 实体唯一口径 + 旧别名表退役」不变量（fail-closed，源码静态扫描）
 *
 * 背景（2026-10-31 机构口径收敛，ADR-0016）：
 *   旧体系是 `agency_aliases`（1 alias→1 canonical + name_i18n，无国家/实体维度），
 *   新体系是 `buyer` / `buyer_alias` / `buyer_candidate`（国家维度实体 + 未命中队列）。
 *   读侧展示链（agencyI18n / 机构下拉聚合 / 别名读时解析）已于 737df0b5 整体退役；
 *   写侧归一（服务表构建）同步切到 buyer 实体，`agency_aliases` 彻底停用。
 *   本门禁把这条口径钉死，防止「旧表回潮」或「买家匹配各写一遍」重新长出第三条链。
 *
 * 规则：
 *   B1) 旧表退役：`src/` 内不得再出现对 agency_aliases 的任何 SQL 读写（FROM/JOIN/INTO/UPDATE/DELETE）。
 *   B2) buyer 三表 SQL 收敛：
 *       - 读 buyer / buyer_alias：只允许 `src/lib/services/buyer/entity-index.ts`（唯一读入口）
 *         与 `src/lib/services/buyer/candidates.ts`（候选登记时判别名是否已存在）；
 *       - 写 buyer_candidate：只允许 `src/lib/services/buyer/candidates.ts`（候选队列唯一写入方）；
 *   B3) 单一匹配入口：`notice-public/build.ts` 必须 import `resolveBuyerEntity` 且归一输入带
 *       `agencyFull: r.agency_full`（采购主体优先全称）；`notice-core.ts` 不得再出现
 *       `normalizeAliasKey` / `agencyAliases` 参数（旧 canonical 化路径不得回流）。
 *   B4) 归一键唯一：只有 `buyer/normalize.ts` 可定义 normalizeBuyerKey（其他文件只许 import）。
 *
 * 用法：npx tsx scripts/gates/check-buyer-ssot.ts
 * @limits 只读源码扫描，不连库。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

function walk(dir: string): string[] {
  const acc: string[] = [];
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) acc.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const fails: string[] = [];
const files = walk("src");
const rel = (p: string): string => p.replace(/\\/g, "/");

// ── B1 旧表退役：agency_aliases 不再被任何 src 代码读写 ──────────────────────
const LEGACY_TABLE = /\b(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+`?agency_aliases`?/i;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (LEGACY_TABLE.test(text)) {
    fails.push(`B1 旧机构别名表已退役，仍被读写: ${rel(f)}（应以 buyer_alias / buyer 为准，见 ADR-0016）`);
  }
}
if (existsSync("src/lib/services/agency/alias-store.ts")) {
  fails.push("B1 旧别名 store 已退役，不得恢复: src/lib/services/agency/alias-store.ts");
}

// ── B2 buyer 三表 SQL 读写收口 ───────────────────────────────────────────────
const BUYER_READERS = new Set([
  "src/lib/services/buyer/entity-index.ts",
  "src/lib/services/buyer/candidates.ts",
]);
const BUYER_CANDIDATE_WRITERS = new Set(["src/lib/services/buyer/candidates.ts"]);
const READ_RE = /\b(FROM|JOIN)\s+`?(buyer|buyer_alias)`?\b/i;
const CANDIDATE_WRITE_RE = /\b(INSERT\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+`?buyer_candidate`?/i;
for (const f of files) {
  const r = rel(f);
  const text = readFileSync(f, "utf8");
  if (READ_RE.test(text) && !BUYER_READERS.has(r)) {
    fails.push(`B2 buyer/buyer_alias 只允许经 buyer/entity-index 读取: ${r}`);
  }
  if (CANDIDATE_WRITE_RE.test(text) && !BUYER_CANDIDATE_WRITERS.has(r)) {
    fails.push(`B2 buyer_candidate 只允许由服务表构建器登记: ${r}`);
  }
}

// ── B3 单一匹配入口 + 归一输入优先 agency_full + 旧 canonical 化不得回流 ──────
const BUILD = "src/lib/services/notice-public/build.ts";
const buildText = readFileSync(BUILD, "utf8");
if (!/\bresolveBuyerEntity\b/.test(buildText)) {
  fails.push(`B3 ${BUILD} 未走 resolveBuyerEntity（买家实体匹配必须收敛到 buyer/entity-index）`);
}
if (!/agencyFull:\s*r\.agency_full\b/.test(buildText)) {
  fails.push(`B3 ${BUILD} 归一输入未带 agency_full（采购主体必须优先全称）`);
}
const CORE = "src/lib/services/notice-normalize/notice-core.ts";
const coreText = readFileSync(CORE, "utf8");
if (/\bnormalizeAliasKey\b|\bagencyAliases\b/.test(coreText)) {
  fails.push(`B3 ${CORE} 仍出现旧别名 canonical 化（normalizeAliasKey / agencyAliases），不得回流`);
}
if (!/\bisAgencyPlaceholder\b/.test(coreText)) {
  fails.push(`B3 ${CORE} 缺少占位/噪声名剔除（isAgencyPlaceholder）`);
}

// ── B4 归一键唯一实现 ───────────────────────────────────────────────────────
const NORMALIZE_OWNER = "src/lib/services/buyer/normalize.ts";
const DEFINE_RE = /function\s+normalizeBuyerKey\b/;
for (const f of files) {
  if (DEFINE_RE.test(readFileSync(f, "utf8")) && rel(f) !== NORMALIZE_OWNER) {
    fails.push(`B4 归一键实现必须唯一（仅在 ${NORMALIZE_OWNER}）: ${rel(f)}`);
  }
}
if (!existsSync(NORMALIZE_OWNER)) fails.push(`B4 找不到买家归一键实现: ${NORMALIZE_OWNER}`);

if (fails.length) {
  for (const f of fails) console.error("  ✗ " + f);
  console.error("✗ 机构口径收敛门禁未通过");
  process.exit(1);
}
console.log(
  "✓ 机构口径收敛门禁通过（B1 agency_aliases 已退役 / B2 buyer 三表 SQL 收口 / " +
  "B3 服务表构建走 resolveBuyerEntity 且优先 agency_full、旧 canonical 化无回流 / B4 归一键唯一）",
);
