/**
 * 门禁 AS1~AS4：落点表契约（UNSPSC 退役 R1' 收口 · ADR-0014）
 *
 * 与 BB15c 的分工：BB15c 抽 400 条（头 200 + 尾 200），本门禁**全量**。2026-10-13 实测
 * 就是这条分工救的 —— 抽样报了 9/400、复算变 4/400，两边都对不上号；全量扫一次直接给出
 * 「整表只缺 5 行」的确定答案。判据不在本文件重写，一律走 attribution-contract。
 *
 * 用法：
 *   npx tsx scripts/gates/check-attribution-ssot.ts                 # 连库全量（生产只读）
 *   ATTR_SSOT_FIXTURE=f.json npx tsx scripts/gates/check-attribution-ssot.ts   # 夹具，不连库
 *
 * @limits 只读。单条语句 60s 服务端超时（MAX_EXECUTION_TIME），宁可失败也不留长查询在生产上。
 *         扫描中断一律 **exit 1**（fail-closed）：规格 §5 写明「不能把没红当成可以切读」，
 *         所以超时/断连不能悄悄退成 0。分批按 notice_pk 走 uk 前缀，内存只留一批。
 * @see docs/adr/0014-attribution-landing-table-two-writers.md
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  auditLanding,
  type ColumnRow,
  type ContractStats,
  type LandingRow,
} from "../../src/lib/services/commodity/attribution-contract";

const FIXTURE = process.env.ATTR_SSOT_FIXTURE ?? "";
const TABLE = process.env.ATTR_SSOT_TABLE ?? "crm_notice_attribution_nodes";
/** 每批多少个公告：一批落点 + 一批列值两份结果集，2000 条约几千行，够用且内存可控 */
const BATCH = 2000;
/** 打印破口样本的上限（与契约内的 MAX_REPORT 同值，双保险） */
const MAX_PRINT = 40;
const fails: string[] = [];

function report(violations: string[], stats: ContractStats) {
  console.log(
    `落点：${stats.noticesWithLanding} 公告 / ${stats.landingRows} 行；列值：${stats.noticesWithColumn} 公告；` +
      `纯 legacy 一致 ${stats.legacyNotices}；ai_content 公告 ${stats.aiNotices}`,
  );
  if (stats.mixedSourceNotices) fails.push(`AS1 混源公告 ${stats.mixedSourceNotices} 条`);
  if (stats.legacyDriftNotices) fails.push(`AS2/AS3 legacy 侧破口 ${stats.legacyDriftNotices} 条`);
  if (stats.orphanColumnNotices) fails.push(`AS4 断供公告 ${stats.orphanColumnNotices} 条`);
  for (const v of violations) console.error("  - " + v);
}

/** 空 stats 累加器：字段与契约一致，缺一个就编译不过（防止加了判据忘了统计） */
const zeroStats = (): ContractStats => ({
  noticesWithLanding: 0,
  noticesWithColumn: 0,
  legacyNotices: 0,
  aiNotices: 0,
  mixedSourceNotices: 0,
  legacyDriftNotices: 0,
  orphanColumnNotices: 0,
  landingRows: 0,
});

async function runDb(): Promise<{ all: string[]; stats: ContractStats }> {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const pool = await mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "crm",
    charset: "utf8mb4",
    connectionLimit: 2,
  });
  const q = async <T>(sql: string, a?: unknown[]): Promise<T[]> =>
    ((await pool.query(sql, a)) as unknown as [T[]])[0];
  try {
    await pool.query("SET SESSION MAX_EXECUTION_TIME = 60000");
    const db = await q<{ d: string }>(`SELECT DATABASE() d`);
    console.log(`连的是库：${db[0].d}@${process.env.DB_HOST}:${process.env.DB_PORT} · 表 ${TABLE} · 只读全量`);

    const all: string[] = [];
    const stats = zeroStats();
    let cur = 0;
    let batches = 0;
    for (;;) {
      const pks = await q<{ pk: number }>(
        `SELECT DISTINCT notice_pk pk FROM \`${TABLE}\` WHERE notice_pk > ? ORDER BY pk LIMIT ${BATCH}`,
        [cur],
      );
      if (pks.length === 0) break;
      cur = Number(pks[pks.length - 1].pk);
      const ph = pks.map(() => "?").join(",");
      const ids = pks.map((r) => r.pk);
      const landings = await q<{ pk: number; code: string; source: string }>(
        `SELECT notice_pk pk, node_code code, source FROM \`${TABLE}\` WHERE notice_pk IN (${ph})`,
        ids,
      );
      const cols = await q<{ pk: number; col: string | null }>(
        `SELECT id pk, backbone_path col FROM crm_notice_search WHERE id IN (${ph})`,
        ids,
      );
      const r = auditLanding(
        landings.map((x) => ({ pk: Number(x.pk), code: String(x.code), source: String(x.source) })),
        cols.map((x) => ({ pk: Number(x.pk), col: String(x.col ?? "") })),
      );
      all.push(...r.violations);
      stats.noticesWithLanding += r.stats.noticesWithLanding;
      stats.noticesWithColumn += r.stats.noticesWithColumn;
      stats.landingRows += r.stats.landingRows;
      stats.legacyNotices += r.stats.legacyNotices;
      stats.aiNotices += r.stats.aiNotices;
      stats.mixedSourceNotices += r.stats.mixedSourceNotices;
      stats.legacyDriftNotices += r.stats.legacyDriftNotices;
      // 分批里不会命中 AS4（本页 pk 是从落点表取的，有列值必有落点），归 0 直接累；
      // 真断供由下面那条反连接找。两个渠道都写进同一个字段，门禁才不会只红一边。
      stats.orphanColumnNotices += r.stats.orphanColumnNotices;
      batches += 1;
    }
    // AS4 走 SQL 反连接：分批喂给纯函数会把「本批没取到列值」假报成断供
    const orphan = await q<{ n: number }>(
      `SELECT COUNT(*) n FROM crm_notice_search ns LEFT JOIN \`${TABLE}\` a ON a.notice_pk = ns.id
         WHERE ns.backbone_path IS NOT NULL AND ns.backbone_path <> '' AND a.notice_pk IS NULL`,
    );
    const orphanN = Number(orphan[0]?.n ?? 0);
    stats.noticesWithColumn += orphanN;
    stats.orphanColumnNotices += orphanN;
    if (orphanN) all.push(`AS4 断供：${orphanN} 条公告有列值但落点表零行 ⇒ 切读那一刻会被清成 NULL`);
    console.log(`扫描完成：${batches} 批，按 notice_pk 分页`);
    return { all, stats };
  } finally {
    await pool.end();
  }
}

if (FIXTURE) {
  const data = JSON.parse(readFileSync(FIXTURE, "utf8")) as { landings?: LandingRow[]; columns?: ColumnRow[] };
  const { violations, stats } = auditLanding(data.landings ?? [], data.columns ?? []);
  report(violations, stats);
} else {
  try {
    const { all, stats } = await runDb();
    report(all.slice(0, MAX_PRINT), stats);
    if (all.length > MAX_PRINT) {
      console.error(`  …另有 ${all.length - MAX_PRINT} 条同类破口（样本上限 ${MAX_PRINT}，全量计数见上一行）`);
    }
  } catch (e) {
    // fail-closed：没扫完 ≠ 扫过了
    console.error(`✗ 落点表契约扫描未完成：${(e as Error).message}`);
    fails.push("扫描未完成（不代表无破口）");
  }
}

if (fails.length) {
  console.error(`✗ 落点表契约未通过：${fails.join("；")}`);
  console.error(
    "修法：AS1 混源 ⇒ 人工定归属（ADR-0014 结论 4）；AS2/AS4 ⇒ 跑 scripts/ops/notice-attribution-backfill.ts --apply --yes 补齐后复扫",
  );
  process.exit(1);
}
console.log("✓ 落点表契约通过（AS1 无混源 / AS2 legacy 派生逐条等于列值 / AS3 无半写 / AS4 无断供）");
