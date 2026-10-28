/**
 * 公告品目归属落点：存量灌入 + 三条对账闸口（旧品类字典码退役 R1）
 *
 * 做什么：把宽表 `notice_search.backbone_path`（60 万行的派生列）压回**最深落点**，
 *         灌进 `notice_attribution_nodes`，`source='legacy_tag'`。
 *         本脚本只写这张新表，**不碰宽表、不碰桥表** —— 切读在 R2，删源在 R3/R4。
 *
 * 为什么能从列值反推而不必回桥表：列值本就是「码→树」的产物且含全部祖先，取最深 token
 *         即得当年换算的落点。反推出来必须再过一次闭包校验（闸口 1），不成立就是脏存量，
 *         整轮判失败，绝不"顺手修好"—— 那是拿脏存量改掉现网归属。
 *
 * 三条闸口（破坏性变更前必须全绿）：
 *   1 逐条相等：closureOfPathColumn(列值) === 列值，差异必须 0（不成立就是列本身会被改写归属 ⇒ 整轮停手）；
 *   2 计数守恒：落点表去重公告数 === 宽表有归属的行数 − 被闸口 3 排除的行数；
 *   3 无幻觉：落点表每个 node_code 都在骨架树里。出现树外码 ⇒ **整条公告不落笔**并列入清单，
 *     不拉一半归属（半条比零条更难查）；这类行不致命，但必须逐条点名、负数可查。
 *     ——实测本镜像库抽 2,000 条有 84/43,688 个 token 在树外（`UGT-2313*` 一族集中出现），
 *     而镜像树只有 82,737 行、文档口径是 15.9 万行 ⇒ 先当镜像漂移看，生产复核后再定性（双环境纪律）。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-attribution-backfill.ts --dry --limit-batches 20   # 先小批看闸口
 *   npx tsx scripts/tools/notice-attribution-backfill.ts --dry                       # 全量 dry（不写库）
 *   npx tsx scripts/tools/notice-attribution-backfill.ts --apply --yes
 *   npx tsx scripts/tools/notice-attribution-backfill.ts --apply --yes --resume      # 从断点续跑
 *   npx tsx scripts/tools/notice-attribution-backfill.ts --apply --yes --incremental # 只灌新进宽表的行
 *
 * 幂等：INSERT IGNORE 撞 uk_notice_node 静默跳过；重跑不改任何一行、不增任何一行。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { loadBackboneIndex, backboneNodeLevel } from "../../src/lib/services/commodity/backbone-path";
import { assertTableName, ATTR_SOURCE_LEGACY } from "../../src/lib/services/commodity/attribution-contract";
import {
  assertAttributionNode,
  closureOfPathColumn,
  leafNodesOfPathColumn,
} from "../../src/lib/services/commodity/attribution";

const APPLY = process.argv.includes("--apply");
const YES = process.argv.includes("--yes");
const RESUME = process.argv.includes("--resume");
const INCREMENTAL = process.argv.includes("--incremental");
const BATCH = 500;
const INSERT_CHUNK = 800;
/**
 * --limit-batches 同时支持 `--limit-batches N` 与 `--limit-batches=N`，且**递了这个开关就必须解析成功**。
 * 原来只认空格形式：递 `--limit-batches=20` 静默取到 Infinity，值非数字时 NaN 让
 * `batchNo >= NaN` 恒假 —— 两个方向都是「想限量却跑成全量写 63.8 万行」。
 * 没递这个开关才是不限批（全量灌入的常规路径）。
 */
const LIMIT_BATCHES = (() => {
  const eq = process.argv.find((a) => a.startsWith("--limit-batches="));
  const i = process.argv.indexOf("--limit-batches");
  if (!eq && i < 0) return Infinity;
  const raw = eq ? eq.slice("--limit-batches=".length) : process.argv[i + 1];
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) {
    console.error(`✗ --limit-batches 递了就必须是正整数，收到：${JSON.stringify(raw ?? null)}`);
    process.exit(1);
  }
  return n;
})();
/**
 * 表名可覆盖：正名表已含不可重算的 ai_content 事实，回滚/演练只能落在影子表上（ADR-0014 纪律 1）。
 * 同时吃 `--table=x` 与 `--table x`（与本文件 --limit-batches 同形制）：只认一种写法时，
 * 操作员递错形式会被静默忽略并落到正名表 —— 那恰好是这条纪律要防的事故。
 */
function argTable(): string {
  const eq = process.argv.find((a) => a.startsWith("--table="));
  if (eq) {
    const v = eq.slice("--table=".length);
    if (!v) {
      console.error("✗ --table= 后面不许空：空值会静默回落到正名表，而正名表是共享表");
      process.exit(1);
    }
    return v;
  }
  const i = process.argv.indexOf("--table");
  if (i > 0) {
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) {
      console.error("✗ --table 后面必须跟表名（同上：不许空值回落正名表）");
      process.exit(1);
    }
    return v;
  }
  return "notice_attribution_nodes";
}
const TABLE = argTable();
// 表名会拼进反引号与 information_schema 的字面量（反引号不转义），形制校验走契约那一份
try {
  assertTableName(TABLE);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}
mkdirSync("runtime", { recursive: true }); // runtime/ 在 gitignore 内，新环境上不存在；登记失败不该阻断正文
/** 正名表：它的状态文件就是现有的那几个（不带后缀，不迁移旧文件） */
const CANON_TABLE = "notice_attribution_nodes";
/**
 * 状态/水位/台账路径按表名分域。不分域的话，一次 `--apply --table <影子表>` 演练会把
 * 影子表的游标写进**正名表**的水位文件 —— 之后 `--incremental` 对正名表就从演练游标起跑，
 * 台账也会把演练写入混成真实写入。演练必须与生产各记各的账。
 */
const RUNTIME_TAG = TABLE === CANON_TABLE ? "" : `-${TABLE.replace(/^crm_/, "")}`;
const STATE = `runtime/notice-attribution${RUNTIME_TAG}-state.json`;
const WATERMARK = `runtime/notice-attribution${RUNTIME_TAG}-watermark.json`;
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const DIFF_REPORT = `runtime/attribution-legacy-diff${RUNTIME_TAG}-${STAMP}.json`;

if (APPLY && !YES) {
  console.error("✗ --apply 必须显式带 --yes（人工闸口）；先跑 --dry 出报表，审完再上");
  process.exit(1);
}
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", connectionLimit: 2,
});
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
  (await pool.query(sql, params))[0] as unknown as T[];
const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T> =>
  ((await q<T>(sql, params))[0]) as T;

type Stats = {
  lastId: number;
  scanned: number;
  /** 压出的落点行数（含被 INSERT IGNORE 跳过的） */
  landingRows: number;
  inserted: number;
  /** 闸口 1：重派生与列值不等的行数，必须 0 */
  closureDiff: number;
  /** 闸口 3：因含树外码而整条不落笔的公告数 */
  phantomNotices: number;
  /** 本轮撞 uk 被跳过、且该 (pk,code) 现在由非 legacy_tag 持有的**对数**（= 归属被换源的量） */
  foreignHeld: number;
  /** 本轮真正有落点可灌的公告数（闸口 2 的 dry 形态靠它守恒） */
  landingNotices: number;
  /** 闸口 3 的树外码去重集（进差异报告，供人工定归因） */
  phantomCodes: string[];
  /** 每条公告的落点数分布（p50/p99/max），用来判断灌入体量是否异常 */
  leafHist: number[];
  samples: Array<{ id: number; was: string; now: string }>;
  phantomSamples: string[];
  done: boolean;
};
const fresh = (): Stats => ({
  lastId: 0, scanned: 0, landingRows: 0, inserted: 0, closureDiff: 0, phantomNotices: 0, landingNotices: 0, phantomCodes: [],
  foreignHeld: 0,
  leafHist: [], samples: [], phantomSamples: [], done: false,
});

const st: Stats = RESUME && existsSync(STATE) ? { ...fresh(), ...JSON.parse(readFileSync(STATE, "utf8")) } : fresh();
if (INCREMENTAL) {
  const wm = existsSync(WATERMARK)
    ? Number((JSON.parse(readFileSync(WATERMARK, "utf8")) as { id?: number }).id ?? 0)
    : 0;
  st.lastId = Number.isFinite(wm) && wm > 0 ? wm : 0;
  st.done = false;
  if (!st.lastId) console.log("⚠ 没有水位文件：本轮增量退化为全量扫，跑完照样写下一次水位");
}
console.log(`模式=${APPLY ? "applied" : "dry"} 表=${TABLE} 批=${BATCH} 游标起点=${st.lastId}${st.done ? "（已完成过）" : ""}${INCREMENTAL ? " · 增量" : ""}`);

// 表必须在场：本脚本不建表（建表是 DDL 脚本的人工闸口）。
// 但 **dry 可以没有表**：不建表就能把三条闸口算出来，才符合「--dry 全绿 → 授权 --apply」的顺序；
// 若 dry 也要表在场，就只能先写库再验证，把人工闸口放到了验证之后（顺序反了）。
const hasTable = await one<{ n: number }>(
  `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='${TABLE}'`,
);
const tableExists = Number(hasTable.n) > 0;
if (!tableExists && APPLY) {
  console.error(`✗ 表 ${TABLE} 不存在：先跑 notice-attribution-ddl.ts --apply --yes`);
  await pool.end();
  process.exit(1);
}
if (!tableExists) console.log(`⚠ 表 ${TABLE} 尚未建（dry 继续：落点表计数按 0 报，三条闸口照常算）`);
const srcTotal = await one<{ n: number }>(
  `SELECT COUNT(*) n FROM notice_search WHERE id > ${st.lastId} AND backbone_path IS NOT NULL AND backbone_path <> ''`,
);
console.log(`灌入源：游标之上 ${srcTotal.n} 条公告有归属列；载入骨架树（闸口 3 用它判「码在不在树里」）…`);
const idx = await loadBackboneIndex(<T>(sql: string) => q<T>(sql));
console.log(`骨架索引就绪：${idx.size} 节点`);

// 写前普查：这张表有第二个写入方（AI 野码分类），落笔前必须知道现在装的是谁的什么行。
// 不普查就 --apply 等于蒙眼写共享表 —— 撞别人的行还是覆盖别人的行，事后无从分辨。
// dry 允许表不在场（见上面的建表注释），所以普查前先判存在性，不能让验证步骤自己报错。
const census: Array<{ s: string; n: number }> = tableExists
  ? await q<{ s: string; n: number }>(`SELECT source s, COUNT(*) n FROM \`${TABLE}\` GROUP BY source`)
  : [];
console.log(`写前普查：${census.map((r) => `${r.s}=${r.n}`).join(" ") || (tableExists ? "（空表）" : "（表未建，跳过）")}`);

/**
 * 写入窗口登记：共享表上「谁在什么时候写了什么 source、多少行」必须留痕可查（规格 §7）。
 * 必须覆盖**所有出口**：闸口失败而 exit 的那一轮恰恰是最可能已经写了数批的 ——
 * 把登记只挂在成功收尾上，等于在最需要留痕的事故窗口里没有痕迹。
 * 登记本身失败不许拖正文（库已写了，静默丢台账才是真代价），但要喊出来。
 */
const writersLog = `runtime/attribution-writers${RUNTIME_TAG}.jsonl`;
function register(kind: string): void {
  try {
    appendFileSync(
      writersLog,
      `${JSON.stringify({
        at: new Date().toISOString(), kind, mode: APPLY ? "applied" : "dry", table: TABLE,
        scanned: st.scanned, attempted: st.landingRows,
        // dry 一笔不落：台账里把 dry 的 inserted 记成 27133 就是假账
        inserted: APPLY ? st.inserted : 0,
        cursor: st.lastId, closureDiff: st.closureDiff, phantomNotices: st.phantomNotices,
        foreignHeld: st.foreignHeld,
        censusBefore: Object.fromEntries(census.map((r) => [r.s, Number(r.n)])),
      })}\n`,
      "utf8",
    );
  } catch (e) {
    console.error(`⚠ 写入窗口登记失败（不影响本轮结果，但这条留痕断了）：${(e as Error).message}`);
  }
}
register("opened"); // 开窗记录：哪怕本轮零落笔，也要知道“此时表里装的是谁的什么行”

let batchNo = 0;
for (;;) {
  if (batchNo >= LIMIT_BATCHES) { console.log(`⚠ 到 --limit-batches ${LIMIT_BATCHES} 上限，本轮停在游标 ${st.lastId}`); break; }
  const wide = await q<{ id: number; p: string }>(
    `SELECT id, backbone_path p FROM notice_search
      WHERE id > ? AND backbone_path IS NOT NULL AND backbone_path <> ''
      ORDER BY id LIMIT ${BATCH}`,
    [st.lastId],
  );
  if (wide.length === 0) break;

  const rows: Array<[number, string, number]> = [];
  for (const w of wide) {
    st.scanned++;
    st.lastId = Math.max(st.lastId, w.id);
    const leaves = leafNodesOfPathColumn(w.p);
    st.leafHist.push(leaves.length);
    const noticeRows: Array<[number, string, number]> = [];
    let phantomThisNotice = false;

    // 闸口 1：重派生必须逐条等于列值。不等 ⇒ 脏列（缺祖先 / 非升序 / 混脏 token），
    // 整批不落笔并停手 —— 带着脏存量灌完，等于把「归属不变」这个承诺改成「大概不变」。
    const again = closureOfPathColumn(w.p);
    if (again !== w.p) {
      st.closureDiff++;
      if (st.samples.length < 20) st.samples.push({ id: w.id, was: w.p.slice(0, 160), now: again.slice(0, 160) });
      continue;
    }
    for (const node of leaves) {
      // 形制闸口：非法直接抛（闭包已成立，这里只会拦空串一类脏值）
      const code = assertAttributionNode(node, w.id);
      // 闸口 3：树外码 ⇒ 整条公告不落笔。宁可这条公告暂时无事实源，也不能把脏码灌成事实
      if (!idx.nodeOf(code)) {
        phantomThisNotice = true;
        if (!st.phantomCodes.includes(code)) st.phantomCodes.push(code);
        if (st.phantomSamples.length < 20) st.phantomSamples.push(`${w.id}/${code}`);
        continue;
      }
      noticeRows.push([w.id, code, backboneNodeLevel(code)]);
    }
    if (phantomThisNotice) {
      st.phantomNotices++;
      noticeRows.length = 0; // 半条归属比零条更难查：整条丢掉
      continue;
    }
    rows.push(...noticeRows);
    st.landingNotices++;
  }

  // 闸口 1 是唯一能「改写现网归属」的口子：差异非 0 就整轮停手（闸口 3 的脏码只排不停）
  if (st.closureDiff) {
    if (APPLY) writeFileSync(STATE, JSON.stringify(st, null, 2), "utf8"); // dry 不配推游标
    console.error(`✗ 第 ${batchNo + 1} 批闭包差异 ${st.closureDiff} 行 —— 重派生会改掉列值，本批不落笔，已停手`);
    console.error(`  闭包样本：${st.samples.map((s) => `${s.id}：${s.was} → ${s.now}`).slice(0, 3).join(" ｜ ")}`);
    batchNo++;
    break;
  }

  if (APPLY) {
    let batchAffected = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      // source 字面量取契约那份：契约注释自称与本脚本写入的是同一份，那就得真的同源
      const ph = chunk.map(() => `(?, ?, ?, 1.00, '${ATTR_SOURCE_LEGACY}', '', '')`).join(",");
      const params = chunk.flatMap(([pk, code, lv]) => [pk, code, lv]);
      const res = await pool.query(
        `INSERT IGNORE INTO \`${TABLE}\` (notice_pk, node_code, level, confidence, source, model, evidence_text) VALUES ${ph}`,
        params,
      );
      batchAffected += Number((res[0] as { affectedRows?: number }).affectedRows ?? 0);
    }
    st.inserted += batchAffected;
    // 撞 uk 被跳过有两种，affectedRows 分不出来：① 自己的 legacy_tag 行已在（幂等重跑，无害）；
    // ② 该 (pk,code) 已由非 legacy source 持有（并发方 ODKU 或早先写入）⇒ 归属来源不是我的，
    // 而 AS1（要两源共在）与 AS4（要零落点）都不抱这种 —— 必须在落笔现场拓出来。
    const skipped = rows.length - batchAffected;
    if (skipped > 0) {
      const ids = wide.map((w) => w.id);
      const ph2 = ids.map(() => "?").join(",");
      // 精确到 (pk,code)：只数「本轮想插、却被非 legacy 行占着」的那些对。按批次行数算会把
      // 幂等重跑的 6.1 万行全当成换源（那完全不是同一件事）。
      const foreign = await q<{ pk: number; code: string }>(
        `SELECT notice_pk pk, node_code code FROM \`${TABLE}\` WHERE notice_pk IN (${ph2}) AND source <> ?`,
        [...ids, ATTR_SOURCE_LEGACY],
      );
      const attempted = new Set(rows.map(([pk, code]) => `${pk}:${code}`));
      const hits = foreign.filter((f) => attempted.has(`${f.pk}:${f.code}`));
      if (hits.length) {
        st.foreignHeld += hits.length;
        console.error(
          `⚠ 第 ${batchNo + 1} 批有 ${hits.length} 对我想插的 (pk,code) 已由非 legacy_tag 持有` +
            `（样本 ${hits.slice(0, 6).map((h) => `${h.pk}/${h.code}`).join(" ")}）` +
            ` ⇒ 这些落点的归属来源不是本次灌入（AS5/ADR-0014 结论 4，要人工定）`,
        );
      }
    }
  } else {
    st.inserted += rows.length; // dry 模式报「将会插入的行数」（台账里另记为 0）
  }
  st.landingRows += rows.length;
  if (APPLY) writeFileSync(STATE, JSON.stringify(st, null, 2), "utf8"); // dry 一笔不落，就不配推可续跑的游标
  console.log(`第 ${batchNo + 1} 批：扫 ${wide.length} 公告 → 落点 ${rows.length} 行（累计 ${st.landingRows}，游标 ${st.lastId}）`);
  batchNo++;
}

// ── 落笔统计与闸口复述 ──
const sorted = st.leafHist.slice().sort((a, b) => a - b);
const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
console.log(`\n每条公告落点数：p50 ${pct(0.5)} / p99 ${pct(0.99)} / max ${pct(0.999)}`);
console.log(`扫描 ${st.scanned} 条公告 → 落点行 ${st.landingRows}${APPLY ? `（实插 ${st.inserted}，其余撞 uk 跳过${st.foreignHeld ? `；其中 ${st.foreignHeld} 行由非 legacy_tag 持有` : ""}）` : "（dry：不落笔）"}`);

const counts = await q<{ k: string; n: number }>(
  `${
    tableExists
      ? `SELECT 'attribution_notices' k, COUNT(DISTINCT notice_pk) n FROM \`${TABLE}\`
   UNION ALL SELECT 'attribution_rows', COUNT(*) FROM \`${TABLE}\`
   UNION ALL `
      : `SELECT 'attribution_notices' k, 0 n
   UNION ALL `
  }SELECT 'wide_filled', COUNT(*) FROM notice_search WHERE backbone_path IS NOT NULL AND backbone_path <> ''`,
);
const c = Object.fromEntries(counts.map((r) => [r.k, Number(r.n)]));
console.log(`\n闸口 1 逐条相等：闭包差异 ${st.closureDiff} 行 ⇒ ${st.closureDiff === 0 ? "✓" : "✗"}`);
console.log(`闸口 3 无幻觉：树外码 ${st.phantomCodes.length} 个、整条排除 ${st.phantomNotices} 条公告 ⇒ ${
  st.phantomNotices === 0 ? "✓" : `⚠ 已排除（样本：${st.phantomSamples.slice(0, 4).join(" ")}；去重码清单见差异报告）`
}`);
// 闸口 2 在 dry 也能判：本轮「落笔公告 + 排除公告」必须等于扫到的有归属公告数
// 游标没追到最大 id 就是部分灌入（--limit-batches / --resume 断点）：这时拿全表数比必然不等，
// 判 ✗ 是把「还没跑完」误报成「对不上」——只有全量跑完那一次才有权判守恒。
const maxId = Number((await one<{ m: number | null }>(`SELECT MAX(id) m FROM notice_search`)).m ?? 0);
const partial = st.lastId < maxId;
if (APPLY) {
  const ok2 = c.attribution_notices === c.wide_filled;
  console.log(`闸口 2 计数守恒${partial ? `（本轮部分灌入：游标 ${st.lastId} < 最大 id ${maxId}，不判全表）` : ""}：落点表 ${c.attribution_notices} 公告（${c.attribution_rows} 行）/ 宽表有归属 ${c.wide_filled} ⇒ ${partial ? "⚠ 待全量跑完" : ok2 ? "✓" : "✗"}`);
  if (!partial && !ok2) { console.error("✗ 闸口 2 不守恒：灌入没覆盖全表，或有公告被意外跳过"); register("aborted-gate2"); await pool.end(); process.exit(1); }
} else {
  const ok2 = st.scanned === st.landingNotices + st.phantomNotices + st.closureDiff;
  console.log(`闸口 2 计数守恒（dry）：扫 ${st.scanned} = 可落笔 ${st.landingNotices} + 排除 ${st.phantomNotices} + 闭包差异 ${st.closureDiff} ⇒ ${ok2 ? "✓" : "✗"}；当前落点表 ${c.attribution_notices ?? 0} 公告`);
  if (!ok2) { console.error("✗ 闸口 2（dry）不守恒：同一公告被重复计数或有公告既未落笔也未排除"); register("aborted-gate2-dry"); await pool.end(); process.exit(1); }
}

if (st.closureDiff) { console.error("✗ 闸口 1 未过，本轮不判完成"); register("aborted-gate1"); await pool.end(); process.exit(1); }

st.done = !partial;
// dry 绝不写 STATE/水位：扫描循环里 st.lastId 会跟着推进，而 dry 一笔不落。
// 让 dry 推水位 = 把「扫过但没灌」的区间标成已完成，下一次 --apply 从那里起跑就会
// 永久跳过那批公告 —— 而 INSERT IGNORE 的幂等性恰好让丢行在事后看不出来。
if (APPLY) {
  writeFileSync(STATE, JSON.stringify(st, null, 2), "utf8");
  writeFileSync(WATERMARK, JSON.stringify({ id: st.lastId, at: new Date().toISOString() }, null, 2), "utf8");
} else {
  console.log(`（dry：不写 STATE/水位；本轮游标只停在内存里的 ${st.lastId}，不影响下一次 --apply 的起点）`);
}
writeFileSync(DIFF_REPORT, JSON.stringify({ mode: APPLY ? "applied" : "dry", ...st }, null, 2), "utf8");
// 收尾登记（登记已在开窗时落过一行，这里补上本轮结果；两个时间点才能算出中间被人写了多少）
register(APPLY ? "closed-applied" : "closed-dry");
console.log(`\n${partial ? "⚠ 部分灌入结束" : "✓ " + (APPLY ? "灌入完成" : "dry 通过")}（游标 ${st.lastId}，差异报告 ${DIFF_REPORT}）${partial ? "：闸口 2 未判，不算 R1 出口" : ""}`);
await pool.end();
