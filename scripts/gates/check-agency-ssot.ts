/**
 * 门禁 ASOT：机构归一「以表为准 + 单一解析入口」不变量（fail-closed，源码静态扫描）
 *
 *   AS1 单一读表：全项目仅 agency/alias-store.ts 可 SELECT agency_aliases。
 *   AS2 展示单一入口：下拉(notice-search/agencies/query.ts)与卡片(search-orchestrator/format.ts)
 *       必须经 agency/resolve 的 resolveAgencyDisplay；禁止再各自 import/调用 translateByPattern
 *       （这正是「别名表 + 正则两套归一各写一遍 → 展示漂移」的根因）。
 *   AS3 采购主体锁定 agency_full：归一输入必须优先全称（① 服务表取列 + notice-core 优先级裁决）。
 *
 * 用法：npx tsx scripts/gates/check-agency-ssot.ts
 * @limits 只读源码扫描，不连库。
 */
import { readFileSync, readdirSync } from "node:fs";

function walk(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) acc.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const fails: string[] = [];
const files = walk("src");

// AS1 单一读表入口
const ALLOW_READER = "src/lib/services/agency/alias-store.ts";
const readerRe = /\bFROM\s+`?agency_aliases`?/i;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (readerRe.test(text) && f !== ALLOW_READER) fails.push(`AS1 旁路读 agency_aliases: ${f}`);
}

// AS2 展示必须走 resolveAgencyDisplay，禁止直连 translateByPattern 旁路
const DISPLAY_FILES = [
  "src/lib/services/notice-search/agencies/query.ts",
  "src/lib/services/search-orchestrator/format.ts",
];
const mustUse = /\bresolveAgencyDisplay\b/;
const bypassSym = /(?:import\s*\{[^}]*\btranslateByPattern|\btranslateByPattern\s*\()/; // 只抓 import/调用，不抓注释里的词
for (const f of DISPLAY_FILES) {
  const text = readFileSync(f, "utf8");
  if (!mustUse.test(text)) fails.push(`AS2 ${f} 未走 resolveAgencyDisplay（须统一到 agency/resolve）`);
  if (bypassSym.test(text)) fails.push(`AS2 ${f} 直连 translateByPattern（两套归一各写一遍的根因，禁用）`);
}

// AS3 采购主体锁定 agency_full：归一输入必须先取 agency_full（agency 常为发布平台码）。
// 2026-10-27 管道翻转后归一化上收到 ① 服务表：读表取列在 notice-public/build.ts（喂
// normalizeBuyerCountry），优先级裁决在 notice-normalize/notice-core.ts；宽表构建器已投影化，
// 不再碰归一输入，此处不得再盯它。
const NORMALIZE_FEEDER = "src/lib/services/notice-public/build.ts";
const feederText = readFileSync(NORMALIZE_FEEDER, "utf8");
if (!/agencyFull:\s*r\.agency_full\b/.test(feederText))
  fails.push(`AS3 ${NORMALIZE_FEEDER} 归一输入未带 agency_full（采购主体必须优先全称）`);
const NORMALIZE_CORE = "src/lib/services/notice-normalize/notice-core.ts";
const coreText = readFileSync(NORMALIZE_CORE, "utf8");
if (!/input\.agencyFull\b/.test(coreText))
  fails.push(`AS3 ${NORMALIZE_CORE} 归一未优先 agencyFull（采购主体必须优先全称）`);

if (fails.length) {
  for (const f of fails) console.error("  ✗ " + f);
  console.error("✗ 机构 SSOT 门禁未通过");
  process.exit(1);
}
console.log("✓ 机构 SSOT 门禁通过（AS1 单一读表 / AS2 下拉与卡片均经 resolveAgencyDisplay、无 translateByPattern 旁路 / AS3 归一输入优先 agency_full）");
