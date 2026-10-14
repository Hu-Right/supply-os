/**
 * 门禁 AS1~AS5：落点表契约（UNSPSC 退役 R1' 收口 · ADR-0014）
 *
 * 与 BB15c 的分工：BB15c 抽 400 条（头 200 + 尾 200），本门禁**全量**。2026-10-13 实测
 * 就是这条分工救的 —— 抽样报了 9/400、复算变 4/400，两边都对不上号；全量扫一次直接给出
 * 「整表只缺 5 行」的确定答案。判据不在本文件重写，一律走 attribution-contract。
 *
 * 用法：
 *   npx tsx scripts/gates/check-attribution-ssot.ts                 # 连库全量（生产只读）
 *   ATTR_SSOT_FIXTURE=f.json npx tsx scripts/gates/check-attribution-ssot.ts   # 夹具，不连库
 *
 * @limits 只读。单条语句 60s 服务端超时（MAX_EXECUTION_TIME，挂在**单连接**的会话上 —— 用池
 *         会让第二条连接带着全局 0 跑全表），宁可失败也不留长查询在生产上。
 *         扫描中断一律 **exit 1**（fail-closed）：规格 §5 写明「不能把没红当成可以切读」，
 *         所以超时/断连不能悄悄退成 0。分批按 notice_pk 走 uk 前缀，内存只留一批。
 * @see docs/adr/0014-attribution-landing-table-two-writers.md
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  assertTableName,
  auditLanding,
  ATTR_SOURCE_LEGACY,
  type ColumnRow,
  type ContractStats,
  type LandingRow,
} from "../../src/lib/services/commodity/attribution-contract";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";

const FIXTURE = process.env.ATTR_SSOT_FIXTURE ?? "";
// 用 || 而不是 ??：自测的“真实库”分支会显式传空串来清掉父 env 残留，
// ?? 不接管空串 ⇒ 表名变 "" ⇒ 被下面的白名单判死，用例永远红在错误的原因上。
const TABLE = process.env.ATTR_SSOT_TABLE || "crm_notice_attribution_nodes";
/** 每批多少个公告：一批落点 + 一批列值两份结果集，2000 条约几千行，够用且内存可控 */
const BATCH = 2000;
/** 打印破口样本的上限（与契约内的 MAX_REPORT 同值，双保险） */
const MAX_PRINT = 40;
/** 服务端单条语句超时（只读门禁不拖垮生产） */
const MAX_EXEC_MS = 60000;
const fails: string[] = [];

function report(violations: string[], stats: ContractStats) {
  console.log(
    `落点：${stats.noticesWithLanding} 公告 / ${stats.landingRows} 行；列值：${stats.noticesWithColumn} 公告；` +
      `纯 legacy 一致 ${stats.legacyNotices}；ai_content 公告 ${stats.aiNotices}` +
      (stats.dirtyColumnNotices ? `；非 legacy 侧脏列 ${stats.dirtyColumnNotices} 条（不判红，只报数）` : ""),
  );
  if (stats.mixedSourceNotices) fails.push(`AS1 混源公告 ${stats.mixedSourceNotices} 条`);
  if (stats.legacyDriftNotices) fails.push(`AS2/AS3 legacy 侧破口 ${stats.legacyDriftNotices} 条`);
  if (stats.orphanColumnNotices) fails.push(`AS4 断供公告 ${stats.orphanColumnNotices} 条`);
  if (stats.sourceReplacedNotices) fails.push(`AS5 换源公告 ${stats.sourceReplacedNotices} 条`);
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
  sourceReplacedNotices: 0,
  dirtyColumnNotices: 0,
  landingRows: 0,
});

/**
 * 质量指标（WARN-only）：开“新事实源推进度”的窗口。
 *
 * 它们不参与 AS1~AS5 契约判定，仅把以下三个数字喷到日志，阅后人工判定：
 *   Q1 活跃集 AI/手工 覆盖率：多少活跃公告已被非 legacy_tag 落点接住
 *   Q2 活跃集待清洗量：多少活跃公告只有 legacy_tag 历史快照（“错但稳定”的那部分）
 *   Q3 ai_content / manual 落点的层级分布：行行锁到多深，看锤粗/锤细
 *
 * 活跃口径用 ACTIVE_NOTICE_WHERE（与搜索口径一致）。失败不阻断主流程（fail-open），
 * 只记一行 ⚠；主契约红不红与它无关。
 */
async function runQuality(
  q: <T>(sql: string, a?: unknown[]) => Promise<T[]>,
): Promise<void> {
  console.log("--- 质量指标（WARN-only，不影响退出码）---");
  try {
    // Q0 活跃公告基数
    const base = await q<{ n: number }>(
      `SELECT COUNT(*) n FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`,
    );
    const total = Number(base[0]?.n ?? 0);
    if (total === 0) {
      console.log("⚠ 活跃公告集为 0（口径异常），跳过质量指标");
      return;
    }
    // Q1 活跃集非 legacy 覆盖（新事实源接住的部分：ai_content ∩ manual）
    const cov = await q<{ n: number }>(
      `SELECT COUNT(DISTINCT n.id) n FROM crm_bid_notices n
         JOIN \`${TABLE}\` a ON a.notice_pk = n.id
        WHERE a.source <> ? AND ${ACTIVE_NOTICE_WHERE}`,
      [ATTR_SOURCE_LEGACY],
    );
    const covered = Number(cov[0]?.n ?? 0);
    // Q2 活跃集仅 legacy（待清洗存量）
    const legacyOnly = await q<{ n: number }>(
      `SELECT COUNT(DISTINCT n.id) n FROM crm_bid_notices n
         JOIN \`${TABLE}\` a ON a.notice_pk = n.id AND a.source = ?
        WHERE ${ACTIVE_NOTICE_WHERE}
          AND NOT EXISTS (SELECT 1 FROM \`${TABLE}\` b
                          WHERE b.notice_pk = n.id AND b.source <> ?)`,
      [ATTR_SOURCE_LEGACY, ATTR_SOURCE_LEGACY],
    );
    const legacyN = Number(legacyOnly[0]?.n ?? 0);
    // Q3 非 legacy 落点的层级分布（代码内部 level 列仅作展示，不作判据）
    const dist = await q<{ level: number; source: string; n: number }>(
      `SELECT level, source, COUNT(DISTINCT notice_pk) n FROM \`${TABLE}\`
        WHERE source <> ? GROUP BY level, source ORDER BY level, source`,
      [ATTR_SOURCE_LEGACY],
    );
    // 活跃集完全无落点（上面三行未抓：既无 legacy、也无 ai/manual）
    const noLanding = await q<{ n: number }>(
      `SELECT COUNT(*) n FROM crm_bid_notices n
        WHERE ${ACTIVE_NOTICE_WHERE}
          AND NOT EXISTS (SELECT 1 FROM \`${TABLE}\` a WHERE a.notice_pk = n.id)`,
    );
    const noLandingN = Number(noLanding[0]?.n ?? 0);

    const pct = (x: number) => `${((x / total) * 100).toFixed(2)}%`;
    console.log(`Q0 活跃公告基数：${total}`);
    console.log(
      `Q1 活跃集 AI/手工 覆盖：${covered} = ${pct(covered)}（历史 legacy_tag 不经新写入器，属“错但稳定”快照）`,
    );
    console.log(
      `Q2 活跃集仅 legacy 待清洗：${legacyN} = ${pct(legacyN)}（目标 向 0 推，靠手工锚定逐条读文判定）`,
    );
    console.log(
      `Q3 活跃集无任何落点：${noLandingN} = ${pct(noLandingN)}（新公告未接住 或 历史漏写；与 AS4 不同，AS4 测“有列值无落点”）`,
    );
    if (dist.length) {
      const byLevel = new Map<number, { ai: number; manual: number }>();
      for (const r of dist) {
        const k = Number(r.level);
        const slot = byLevel.get(k) ?? { ai: 0, manual: 0 };
        if (r.source === "manual") slot.manual += Number(r.n);
        else slot.ai += Number(r.n);
        byLevel.set(k, slot);
      }
      const parts = [...byLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lv, v]) => `L${lv}=ai:${v.ai}/manual:${v.manual}`);
      console.log(`Q4 非 legacy 落点层级分布（同一公告可多行）：${parts.join("  ")}`);
    }
    // 阅后目测提示（不判红）：锤分布提醒
    if (covered === 0) console.log("⚠ Q1 活跃集 AI/手工 覆盖为 0：手工锚定未上手，新事实源对活跃集无接住");
    if (noLandingN > 0 && covered === 0) {
      console.log("⚠ 活跃集无落点且无新锚定：新公告将一律 backbone_path NULL（对照 BB16）");
    }
  } catch (e) {
    console.log(`⚠ 质量指标采集未完成（不影响契约判定）：${(e as Error).message}`);
  }
}

async function runDb(): Promise<{ all: string[]; stats: ContractStats }> {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  // 表名来自 env，形制校验走契约那一份（不众成三个入口各写一套正则）
  assertTableName(TABLE);
  const host = process.env.DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.DB_PORT) || 3306;
  // 故意用单连接而不是池：MAX_EXECUTION_TIME 是**会话**变量，池里第二条连接会带着全局 0 跑
  // 全表反连接（顺序查询恰好复用同一连接，属巧合）。同仓 notice-attribution-ddl 已记过这个坑。
  const conn = await mysql.createConnection({
    host,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "crm",
    charset: "utf8mb4",
  });
  const q = async <T>(sql: string, a?: unknown[]): Promise<T[]> =>
    ((await conn.query(sql, a)) as unknown as [T[]])[0];
  try {
    await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${MAX_EXEC_MS}`);
    const db = await q<{ d: string }>(`SELECT DATABASE() d`);
    console.log(`连的是库：${db[0].d}@${host}:${port} · 表 ${TABLE} · 只读全量`);

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
      stats.sourceReplacedNotices += r.stats.sourceReplacedNotices;
      stats.dirtyColumnNotices += r.stats.dirtyColumnNotices;
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
    if (orphanN) {
      all.push(`AS4 断供：${orphanN} 条公告有列值但落点表零行 ⇒ 切读那一刻会被清成 NULL`);
      // 只报总数等于让人再跑一次 SQL：顺手取 10 个 pk 当样本（仍只读）
      const sample = await q<{ pk: number }>(
        `SELECT ns.id pk FROM crm_notice_search ns LEFT JOIN \`${TABLE}\` a ON a.notice_pk = ns.id
           WHERE ns.backbone_path IS NOT NULL AND ns.backbone_path <> '' AND a.notice_pk IS NULL
           ORDER BY ns.id LIMIT 10`,
      );
      if (sample.length) all.push(`AS4 样本 pk：${sample.map((r) => r.pk).join(" ")}`);
    }
    console.log(`扫描完成：${batches} 批，按 notice_pk 分页`);

    // ── 质量指标（WARN-only，不影响退出码）──
    // AS1~AS5 只测结构自洽：legacy_tag 历史快照内部一致不代表语义对得上现实。
    // 这组指标量“新事实源的推进度”：活跃集 AI/手工 覆盖率 + 层级分布 + 待清洗存量。
    // 不设硬阈值（手工锚定阶段性数据，阈值会假报），只报数。需阅后人工判定。
    await runQuality(q);

    return { all, stats };
  } finally {
    await conn.end();
  }
}

if (FIXTURE) {
  try {
    const data = JSON.parse(readFileSync(FIXTURE, "utf8")) as { landings?: LandingRow[]; columns?: ColumnRow[] };
    // 夹具零校验会假绿：`{}` 被当成“干净”打印通过。坏夹具宁可红，不能绿。
    if (!Array.isArray(data.landings) || !Array.isArray(data.columns)) {
      throw new Error("夹具必须同时含 landings[] 与 columns[] 两个数组");
    }
    const { violations, stats } = auditLanding(data.landings, data.columns);
    report(violations, stats);
  } catch (e) {
    console.error(`✗ 夹具不可用：${(e as Error).message}`);
    fails.push("夹具未能执行（不代表无破口）");
  }
} else {
  try {
    const { all, stats } = await runDb();
    report(all.slice(0, MAX_PRINT), stats);
    if (all.length > MAX_PRINT) {
      console.error(`  …样本只打 ${MAX_PRINT} 条，全量规模看下一行的 ✗ 汇总（由 stats 计数，不是样本条数）`);
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
console.log("✓ 落点表契约通过（AS1 无混源 / AS2 legacy 派生逐条等于列值 / AS3 无半写 / AS4 无断供 / AS5 无换源）");
