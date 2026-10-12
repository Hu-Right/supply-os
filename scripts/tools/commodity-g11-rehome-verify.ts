/**
 * 品目树命名质量与名实覆盖度验收器（可指任意表：正名表 / 影子表）
 *
 * 为什么要它：门禁 BB1~BB15 只管结构自洽（码长、父码、族唯一、派生可重算），
 *   结构全绿的树照样可以「名字说 A、肚子里装 B」——旧 01 抽屉就是活标本：
 *   42.6% 的小类是「每 8 个类切一刀」的定长块，89.7% 的小类名直接照抄某个子类名，
 *   于是「动物栖息地笼舍」装着发电设备维保。这类缺陷没有任何结构断言能抓住。
 *
 * 三条判据（都是可量化的，不接受"看起来还行"）：
 *   Q1 覆盖度：小类内公告量最大的子类占比。太低 = 名字只覆盖一小块内容，其余是错挂；
 *      阈值默认 0.35（混装桶允许低，但必须 note 里写明「混装:」，否则算违规）。
 *   Q2 贪心取名：多成员小类的名字不得等于其任一子类的名字（旧树的病根）。
 *   Q3 定长分块：恰好 N 个孩子且成员码连续成块 ⇒ 机器切块未复核的指纹。
 *   Q4 跨族：同一小类内出现多个 UNSPSC 族（族是标准里的自然归类单位）。
 *
 * 计数口径：公告量按「当前正名表 + 倒排表」实测，再按 unspsc_prefix 搬到被验收的表上
 *   （影子表的码还没有倒排行，所以必须用前缀对齐；前缀是 UNSPSC 身份，跨表稳定）。
 *
 * 用法：
 *   npx tsx scripts/tools/commodity-g11-rehome-verify.ts                       # 验收当前正名表（旧树基线）
 *   npx tsx scripts/tools/commodity-g11-rehome-verify.ts --table crm_commodity_backbone__new  # 验收影子表
 *   npx tsx scripts/tools/commodity-g11-rehome-verify.ts --group UGT-G-16      # 换抽屉做对照
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { auditBusinessLayer, type BackboneRow } from "../../src/lib/services/commodity/rehoming-g11.js";

const args = process.argv;
const argOf = (name: string, dft: string) => {
  const i = args.indexOf(name);
  return i > 0 && args[i + 1] ? args[i + 1] : dft;
};
const TABLE = argOf("--table", "crm_commodity_backbone");
const GROUP = argOf("--group", "UGT-G-11");
/** 计数来源表（倒排表按码计数，码只存在于正名表里） */
const COUNT_SRC = argOf("--count-src", "crm_commodity_backbone");
const OUT = new URL(`../../runtime/commodity-rehome-verify-${GROUP}-${TABLE.replace(/\W+/g, "")}.json`, import.meta.url);

for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
const q = async <T = Record<string, unknown>>(sql: string, a?: unknown[]) => ((await conn.query(sql, a)) as [T[], unknown])[0];

type N = { code: string; parent_code: string; level: number; unspsc_prefix: string | null; name_zh: string; note: string; status: number };
const raw = await q<N>(
  `SELECT code, parent_code, level, unspsc_prefix, name_zh, note, status FROM \`${TABLE}\` WHERE group_code = ? ORDER BY code`,
  [GROUP],
);
if (!raw.length) { console.error(`❌ ${TABLE} 里没有 group_code=${GROUP} 的行`); process.exit(1); }
// 把库行射成审计函数的入参形状（判据不在本脚本里再实现一遍）
const rows: BackboneRow[] = raw.map((r) => ({
  code: r.code, parentCode: r.parent_code, level: r.level, groupCode: GROUP,
  unspscPrefix: r.unspsc_prefix, nameZh: r.name_zh, nameEn: "", sort: 0, status: r.status, note: r.note,
}));

// ── 公告量按前缀实测（L4 用 6 位、L5 用 8 位），一次点查一批 ──
const srcRows = await q<{ code: string; p: string }>(
  `SELECT code, unspsc_prefix p FROM \`${COUNT_SRC}\` WHERE group_code = ? AND level IN (4,5)`,
  [GROUP],
);
const cntByPrefix = new Map<string, number>();
for (let i = 0; i < srcRows.length; i += 400) {
  const part = srcRows.slice(i, i + 400);
  const res = await q<{ node: string; n: number }>(
    `SELECT node, COUNT(*) n FROM crm_notice_backbone_nodes WHERE node IN (?) GROUP BY node`,
    [part.map((x) => x.code)],
  );
  const codeToPrefix = new Map(part.map((x) => [x.code, x.p]));
  for (const r of res) {
    const p = codeToPrefix.get(String(r.node));
    if (p) cntByPrefix.set(p, Number(r.n));
  }
}
const kidsOf = (code: string) => rows.filter((r) => r.parentCode === code);
const l2s = rows.filter((r) => r.level === 2);
const l3s = rows.filter((r) => r.level === 3);
const l4s = rows.filter((r) => r.level === 4);
console.log(`=== ${TABLE} / ${GROUP}：L2 ${l2s.length} · L3 ${l3s.length} · L4 ${l4s.length} · L5 ${rows.filter((r) => r.level === 5).length} ===`);

// 判据只实现一份：调 rehoming-g11 的纯函数，本脚本只负责取数与打印
const audit = auditBusinessLayer(rows, cntByPrefix);
const items = audit.items;
const greedy = items.filter((x) => x.greedy).length;
const lowCover = items.filter((x) => x.cover < 0.35).length;
const crossFam = items.filter((x) => x.crossFamily > 1).length;
const mixedLabeled = items.filter((x) => x.mixed).length;
// 定长块指纹：成员码连续占比 ≥ 75% 且孩子数 ≥ 6（码顺序切块的特征，语义分组不会这么整）
let fixedChunk = 0;
for (const l3 of l3s) {
  const ps = kidsOf(l3.code).map((k) => String(k.unspscPrefix ?? "")).sort();
  let cont = 0;
  for (let i = 1; i < ps.length; i += 1) if (Number(ps[i]) - Number(ps[i - 1]) === 1) cont += 1;
  if (ps.length >= 6 && cont / (ps.length - 1) >= 0.75) fixedChunk += 1;
}

const summary = {
  table: TABLE, group: GROUP, l2: l2s.length, l3: l3s.length, l4: l4s.length,
  greedyNameCopies: greedy,
  lowCoverageL3: lowCover,
  fixedChunkFingerprint: fixedChunk,
  crossFamilyL3: crossFam,
  mixedMarkedL3: mixedLabeled,
  violations: audit.problems.length,
};
console.log(JSON.stringify(summary, null, 2));
if (audit.problems.length) {
  console.log(`违规项（必须人工处置或写进 note）：`);
  for (const p of audit.problems.slice(0, 40)) console.log(`  ${p}`);
}
console.log(`\n逐小类审计结果：`);
for (const it of items) {
  console.log(`  ${it.code} ${it.name}｜子 ${it.kids}｜覆盖 ${it.cover.toFixed(2)}${it.mixed ? "｜已标混装" : ""}${it.greedy ? "｜❗贪心取名" : ""}${it.crossFamily > 1 ? `｜❗跨族 ${it.crossFamily}` : ""}`);
}

writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), summary, problems: audit.problems, items }, null, 2), "utf8");
console.log(`\n报告：${OUT.pathname}`);
await conn.end();
