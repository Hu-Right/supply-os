/**
 * 只读探针：把「正文够不够」拆成可判读的分档 —— 回答"该先补正文还是先打标"
 *
 * 口径不在此重写：ACTIVE_NOTICE_WHERE / withoutValidLandingWhere / withMinContentWhere
 * 全部直引契约与 utils（第一版探针手拼了一份"未过期"条件，漏掉 PLATFORM_PUBLISHED_ONLY，
 * 于是人群比门禁 Q5 多出一万几千条 —— 那种数字不可比，故改为共享片段）。
 * 全程只发 SELECT，不写任何表、不调任何 API。
 *
 * 用法：npx tsx scripts/tools/notice-content-depth-probe.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  ATTR_LANDING_TABLE,
  ATTR_MIN_CONTENT_CHARS,
  withoutValidLandingWhere,
  withMinContentWhere,
} from "../../src/lib/services/commodity/attribution-contract";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";
import { DESC_SOURCE_EXPR } from "../../src/lib/utils/notice-field-limits";
import { WIDE_OPP_JOIN } from "../../src/lib/services/search-sync/wide-sync-sql";

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
  ((await conn.query(`/*+ MAX_EXECUTION_TIME(120000) */ ${sql}`, p))[0]) as unknown as T[];
const out: string[] = [];
const say = (s: string) => out.push(s);

const POP = `${ACTIVE_NOTICE_WHERE} AND ${withoutValidLandingWhere(ATTR_LANDING_TABLE)}`;
const LEN = "CHAR_LENGTH(TRIM(IFNULL(n.description,'')))";
/** 标题复读：正文前 25 字与标题前 25 字相同 ⇒ 正文没带来标题之外的信息（25 字是跨语言的粗下限） */
const ECHO = "LEFT(TRIM(n.description),25) = LEFT(TRIM(n.title),25)";

const base = await q<{ n: number }>(`SELECT COUNT(*) n FROM bid_notices n WHERE ${POP}`);
const total = Number(base[0]?.n ?? 0);
say(`人群（活跃 ∩ 无有效落点 L2+，口径 = 门禁 Q5）：${total}`);

// ── 1. 长度分档 × 标题复读 × 有 url ──
const bands = await q<{ band: string; n: number; echo: number; with_url: number }>(
  `SELECT CASE
            WHEN ${LEN} = 0 THEN '00 空'
            WHEN ${LEN} < ${ATTR_MIN_CONTENT_CHARS} THEN '01 1-40 薄于下限'
            WHEN ${LEN} < 81 THEN '02 41-80 勉强过闸'
            WHEN ${LEN} < 151 THEN '03 81-150 一句话'
            WHEN ${LEN} < 301 THEN '04 151-300'
            WHEN ${LEN} < 501 THEN '05 301-500'
            WHEN ${LEN} < 1001 THEN '06 501-1000'
            ELSE '07 >1000' END band,
          COUNT(*) n, SUM(${ECHO}) echo, SUM(n.url IS NOT NULL AND n.url <> '') with_url
     FROM bid_notices n WHERE ${POP} GROUP BY band ORDER BY band`,
);
say(`\n=== 正文长度分档（复读率 = 正文前25字与标题同）===`);
for (const r of bands) {
  const n = Number(r.n);
  say(
    `${r.band}：${n} = ${((n / total) * 100).toFixed(1)}%｜标题复读 ${r.echo} = ${(
      (Number(r.echo) / n) * 100
    ).toFixed(1)}%｜有 url ${r.with_url}`,
  );
}

// ── 2. 「够打标」在不同下限下的队列规模（决定顺序的那个数）──
say(`\n=== 可打标队列随下限的收缩（同人群）===`);
const variants: Array<[string, string]> = [
  [`现契约下限 ≥${ATTR_MIN_CONTENT_CHARS} 字`, `${withMinContentWhere("n")}`],
  [`≥41 且不是标题复读`, `(${withMinContentWhere("n")}) AND NOT (${ECHO})`],
  [`≥151 字`, `${LEN} >= 151`],
  [`≥151 且不是标题复读`, `(${LEN} >= 151) AND NOT (${ECHO})`],
  [`≥301 字`, `${LEN} >= 301`],
];
for (const [label, expr] of variants) {
  const r = await q<{ n: number }>(`SELECT COUNT(*) n FROM bid_notices n WHERE ${POP} AND ${expr}`);
  const n = Number(r[0]?.n ?? 0);
  say(`${label}：${n} = ${((n / total) * 100).toFixed(1)}% 可直接推给打标`);
}
const notYet = await q<{ n: number }>(
  `SELECT COUNT(*) n FROM bid_notices n WHERE ${POP} AND NOT (${variants[1][1]})`,
);
say(`→ 按「≥41 且非复读」判，剩下的 ${notYet[0]?.n ?? 0} 条属于「补正文才有意义」那批`);

// ── 3. 集中在谁身上：国家 × 公告类型（能否只补采一小块）──
for (const col of ["country", "notice_type"]) {
  const top = await q<{ v: string; n: number; thin: number; echo: number }>(
    `SELECT n.${col} v, COUNT(*) n, SUM(${LEN} < ${ATTR_MIN_CONTENT_CHARS}) thin, SUM(${ECHO}) echo
       FROM bid_notices n WHERE ${POP} GROUP BY n.${col} ORDER BY n DESC LIMIT 8`,
  );
  say(`\n按 ${col} Top8：`);
  for (const r of top) {
    say(`  ${String(r.v).slice(0, 26)}：总 ${r.n}｜正文不够 ${r.thin}｜标题复读 ${r.echo}`);
  }
}

// ── 4. 修正 ECHO 自己的粗判据：以标题开头 ≠ 纯复读，要看去掉标题后还剩多少字──
//    上一节的「≥41 且非复读 = 42,601」把「标题开头 + 后面还有几百字正文」也误剔了，
//    所以它是低估。真判据应该是「增量正文长度 residual」。
const RESID = "(CHAR_LENGTH(TRIM(n.description)) - CHAR_LENGTH(TRIM(n.title)))";
say(`\n=== 「正文以标题开头」那批里，去掉标题后的增量正文分档 ===`);
const resid = await q<{ band: string; n: number; with_url: number }>(
  `SELECT CASE WHEN ${RESID} <= 0 THEN 'R0 无增量（正文 ≤ 标题长）'
            WHEN ${RESID} < 20 THEN 'R1 1-19 字（等于没补）'
            WHEN ${RESID} < 80 THEN 'R2 20-79 字'
            WHEN ${RESID} < 200 THEN 'R3 80-199 字'
            ELSE 'R4 ≥200 字（真正文）' END band,
          COUNT(*) n, SUM(n.url IS NOT NULL AND n.url <> '') with_url
     FROM bid_notices n WHERE ${POP} AND ${ECHO} GROUP BY band ORDER BY band`,
);
for (const r of resid) {
  const n = Number(r.n);
  say(`${r.band}：${n} = 占人群 ${((n / total) * 100).toFixed(1)}%｜有 url ${r.with_url}`);
}

// ── 5. 两条可用口径的对比（「能打标」到底多大，取决于这条线画在哪）──
say(`\n=== 两个边界下的队列规模 ===`);
for (const [label, expr] of [
  [`宽松：≥41 字（现契约）`, `${withMinContentWhere("n")}`],
  [`中等：≥41 字且增量正文 ≥80 字（或非标题开头）`, `(${withMinContentWhere("n")}) AND (NOT (${ECHO}) OR ${RESID} >= 80)`],
  [`严格：增量正文 ≥80 字（或非标题开头）`, `(NOT (${ECHO}) OR ${RESID} >= 80)`],
] as Array<[string, string]>) {
  const r = await q<{ n: number }>(`SELECT COUNT(*) n FROM bid_notices n WHERE ${POP} AND ${expr}`);
  const n = Number(r[0]?.n ?? 0);
  say(`${label}：${n} = ${((n / total) * 100).toFixed(1)}%`);
}

// ── 6. 内容是否本来就在附件里（决定「回拉页面」有没有用）──
const wcols = await q<{ c: string }>(
  `SELECT COLUMN_NAME c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='notice_search'`,
);
const docCol = wcols.map((r) => r.c).find((c) => /documents_count|attachment|file_count/i.test(c));
if (docCol) {
  const d = await q<{ has_doc: number; n: number }>(
    `SELECT SUM(w.${docCol} > 0) has_doc, COUNT(*) n FROM bid_notices n
       JOIN notice_search w ON w.id = n.id
      WHERE ${POP} AND (${LEN} < ${ATTR_MIN_CONTENT_CHARS} OR (${ECHO} AND ${RESID} < 80))`,
  );
  say(`\n「正文无增量」人群中 ${docCol}>0：${d[0]?.has_doc ?? 0} / ${d[0]?.n ?? 0}（有附件 ⇒ 回拉页面未必拿得到正文）`);
} else {
  say(`\n宽表未找到附件计数列（已扫 ${wcols.length} 列）`);
}

// ── 7. 人工判读样本：每个增量档抽几条，看标题之外到底还有没有东西──
const sample: string[] = ["resid_band\tnotice_id\tcountry\ttitle\tdescription_head\tresidual"];
for (const [label, expr] of [
  ["R0-R1 无增量", `${ECHO} AND ${RESID} < 20`],
  ["R2 20-79", `${ECHO} AND ${RESID} >= 20 AND ${RESID} < 80`],
  ["R4 真正文", `${ECHO} AND ${RESID} >= 200`],
] as Array<[string, string]>) {
  const rows = await q<{ notice_id: string; country: string; title: string; head: string; resid: number }>(
    `SELECT n.notice_id, n.country, LEFT(n.title,80) title, LEFT(TRIM(n.description),300) head, ${RESID} resid
       FROM bid_notices n WHERE ${POP} AND ${expr} ORDER BY n.id LIMIT 8`,
  );
  for (const r of rows) {
    sample.push([label, r.notice_id, r.country, JSON.stringify(r.title), JSON.stringify(r.head), String(r.resid)].join("\t"));
  }
}
say(`\n样本 24 条（每档 8 条）→ runtime/content-echo-sample.tsv`);

// ── 8. 正文取错了表的影响：全库「正文」的 SSOT 是 COALESCE(opp.description, n.description)，
//    而打标脚本与本次新加的正文字数闸读的都是 n.description。这里量一下差多少。
const LEN2 = `CHAR_LENGTH(TRIM(IFNULL(${DESC_SOURCE_EXPR},'')))`;
const ECHO2 = `LEFT(TRIM(${DESC_SOURCE_EXPR}),25) = LEFT(TRIM(n.title),25)`;
const RESID2 = `(${LEN2} - CHAR_LENGTH(TRIM(n.title)))`;
say(`\n=== 换成真正的正文来源（机会表优先，= 宽表/详情页展示的那一份）===`);
const src = await q<{ n: number; opp_row: number; opp_wins: number; ok_loose: number; ok_mid: number }>(
  `SELECT COUNT(*) n,
          SUM(opp.description IS NOT NULL) opp_row,
          SUM(opp.description IS NOT NULL AND CHAR_LENGTH(TRIM(opp.description)) > CHAR_LENGTH(TRIM(IFNULL(n.description,'')))) opp_wins,
          SUM(${LEN2} >= ${ATTR_MIN_CONTENT_CHARS}) ok_loose,
          SUM((${LEN2} >= ${ATTR_MIN_CONTENT_CHARS}) AND (NOT (${ECHO2}) OR ${RESID2} >= 80)) ok_mid
     FROM bid_notices n ${WIDE_OPP_JOIN} WHERE ${POP}`,
);
const r0 = src[0];
say(`机会表有行的：${r0?.opp_row ?? 0} / ${r0?.n ?? 0}（其中机会表正文比主表长的 ${r0?.opp_wins ?? 0} 条 ⇒ 打标现在读不到它）`);
say(`按真实源「≥41 字」：${r0?.ok_loose ?? 0}｜按真实源「≥41 且增量≥80 或非标题开头」：${r0?.ok_mid ?? 0}`);
const gap = await q<{ n: number }>(
  `SELECT COUNT(*) n FROM bid_notices n ${WIDE_OPP_JOIN}
     WHERE ${POP} AND CHAR_LENGTH(TRIM(IFNULL(n.description,''))) < ${ATTR_MIN_CONTENT_CHARS}
       AND CHAR_LENGTH(TRIM(IFNULL(opp.description,''))) >= ${ATTR_MIN_CONTENT_CHARS}`,
);
say(`仅因「只读主表」就被判为正文不够、而机会表里其实有≥41 字正文的：${gap[0]?.n ?? 0} 条`);

await conn.end();
writeFileSync(`runtime/content-depth-${STAMP}.txt`, out.join("\n") + "\n", "utf8");
writeFileSync("runtime/content-echo-sample.tsv", sample.join("\n") + "\n", "utf8");
console.log(`written runtime/content-depth-${STAMP}.txt + content-echo-sample.tsv`);
