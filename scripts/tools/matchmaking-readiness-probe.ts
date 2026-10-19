/**
 * 只读探针：撮合就绪度（可投产的北极星指标当前值）
 *
 * 为什么用它当标准：质量达不达标不由"字段填满率"决定，而由消费端能不能跑决定——
 * 买家点一个品目能看到几条活跃公告、供应商侧有几家挂着该品目，两边同时非空才叫"可撮合"。
 * 全程只发 SELECT，不写表、不调 API。判据直引契约（有效落点 = 码长 ≥8）。
 *
 * 用法：npx tsx scripts/tools/matchmaking-readiness-probe.ts   # 北极星当前值，将来升为门禁 Q7 指标
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { ATTR_LANDING_TABLE, ATTR_VALID_MIN_CODE_LEN } from "../../src/lib/services/commodity/attribution-contract";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";

const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
const q = async <T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]> =>
  ((await conn.query(`/*+ MAX_EXECUTION_TIME(180000) */ ${sql}`, p))[0]) as unknown as T[];
const out: string[] = [];
const say = (s: string) => out.push(s);

// ── 供应表形制先摸清（探针不许猜列）──
const scols = await q<{ c: string }>(
  `SELECT COLUMN_NAME c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='crm_supplier_backbone_interests'`,
);
const names = scols.map((r) => r.c);
const pk = names.find((c) => /supplier_pk|supplier_id|fk_supplier|company_id/.test(c)) ?? null;
const codeCol = names.find((c) => /^code$|node_code|backbone_code/.test(c)) ?? "code";
say(`crm_supplier_backbone_interests 列：${names.join(" ")}`);
say(`  连接键取 ${pk ?? "（未识别！）"}｜品目列取 ${codeCol}`);
if (!pk) {
  console.error("✗ 供应表没识别出供应商连接键，停止（不猜列名）");
  process.exit(1);
}
const srcCol = names.includes("source") ? `, SUM(source='self_report') sr, SUM(source='ai_supplier_l5') ai` : "";

// ── 两侧节点集与交集 ──
const N1 = `(SELECT a.node_code code, COUNT(DISTINCT a.notice_pk) na
    FROM \`${ATTR_LANDING_TABLE}\` a JOIN crm_bid_notices n ON n.id = a.notice_pk
   WHERE ${ACTIVE_NOTICE_WHERE} AND LENGTH(a.node_code) >= ${ATTR_VALID_MIN_CODE_LEN}
   GROUP BY a.node_code)`;
const S1 = `(SELECT ${codeCol} code, COUNT(DISTINCT ${pk}) ns${srcCol}
    FROM crm_supplier_backbone_interests WHERE ${codeCol} IS NOT NULL AND ${codeCol} <> ''
   GROUP BY ${codeCol})`;

const nCnt = await q<{ n: number }>(`SELECT COUNT(DISTINCT node_code) n FROM \`${ATTR_LANDING_TABLE}\` WHERE LENGTH(node_code) >= ${ATTR_VALID_MIN_CODE_LEN}`);
const sAll = await q<{ n: number; sup: number }>(
  `SELECT COUNT(DISTINCT ${codeCol}) n, COUNT(DISTINCT ${pk}) sup FROM crm_supplier_backbone_interests WHERE ${codeCol} IS NOT NULL AND ${codeCol} <> ''`,
);
say(`\n公告侧有有效落点的品目节点（全库）：${nCnt[0].n}`);
say(`供应侧挂着的品目节点：${sAll[0].n}（覆盖供应商 ${sAll[0].sup} 家）`);

const inter = await q<{ nodes: number; ready5x3: number; ready10x5: number; na: number; ns: number }>(
  `SELECT COUNT(*) nodes, SUM(x.na >= 5 AND x.ns >= 3) ready5x3, SUM(x.na >= 10 AND x.ns >= 5) ready10x5,
          SUM(x.na) na, SUM(x.ns) ns
     FROM (SELECT n1.code, n1.na, s1.ns FROM ${N1} n1 JOIN ${S1} s1 ON s1.code = n1.code) x`,
);
const i = inter[0];
say(`\n=== 北极星：双边都有货的品目 ===`);
say(`交集节点数（公告≥1 且 供应≥1）：${i.nodes}`);
say(`  这些节点上挂着活跃公告 ${i.na} 条、供应商合计 ${i.ns} 家次`);
say(`「公告≥5 且 供应商≥3」可撮合品目：${i.ready5x3}`);
say(`「公告≥10 且 供应商≥5」有厚度可撮合品目：${i.ready10x5}`);

const oneSide = await q<{ only_notice: number }>(
  `SELECT COUNT(*) only_notice FROM (SELECT n1.code FROM ${N1} n1 LEFT JOIN ${S1} s1 ON s1.code=n1.code WHERE s1.code IS NULL) z`,
);
say(`\n单边空转：公告有落点但供应侧一家都没有的节点 ${oneSide[0].only_notice}`);
const supNoNotice = await q<{ n: number }>(
  `SELECT COUNT(*) n FROM ${S1} s1 LEFT JOIN (SELECT DISTINCT node_code code FROM \`${ATTR_LANDING_TABLE}\` WHERE LENGTH(node_code) >= ${ATTR_VALID_MIN_CODE_LEN}) a ON a.code=s1.code WHERE a.code IS NULL`,
);
say(`供应侧有锚但公告侧（全库有效落点）从未出现的节点：${supNoNotice[0].n}`);

// ── 体验侧：拿供应侧最容易配到的 10 个节点看公告厚度 ──
const top = await q<{ code: string; na: number; ns: number }>(
  `SELECT n1.code, n1.na, s1.ns FROM ${N1} n1 JOIN ${S1} s1 ON s1.code=n1.code ORDER BY n1.na DESC LIMIT 10`,
);
say(`\n公告最厚的 10 个交集品目：`);
for (const r of top) say(`  ${r.code}：活跃公告 ${r.na}｜供应商 ${r.ns}`);

await conn.end();
writeFileSync(`runtime/matchmaking-readiness-${STAMP}.txt`, out.join("\n") + "\n", "utf8");
console.log(out.join("\n"));
