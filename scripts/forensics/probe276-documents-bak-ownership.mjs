/**
 * probe276 · 库侧多出一张 bak 表：它是谁、装的是什么（只读归属取证）
 *
 * 为什么这支要长期入库：2026-10-15 批次四切换后盘点本表系列时，发现一张不属于本仓作业的
 * `crm_bid_notices_documents_bak_20261015`（194 行），行数正好等于当轮定位到的 `documents`
 * 静默改写行数。要判定三件事，缺一就成了半成品结论：
 *   ① 归属：建表时间与列形制是不是本仓作业产物（本仓从未建过 bak 表，全仓 grep 零提及）；
 *   ② 内容：它的 id 集合是否就是「现网 documents ≠ 上一批旧位 documents」那批差异行
 *      —— 若完全重合，说明有人在改 `documents` 前自己留了旧值快照（**别人的在途迁移**，我们不得碰）；
 *   ③ 面宽度：本仓 baseline 的排除规则是否已覆盖这个表名（否则下一轮重导会把快照表当终态结构归档）。
 *
 * 用法：node --env-file=.env scripts/forensics/probe276-documents-bak-ownership.mjs [--bak=<表名>]
 */
import { conn, columnsOf } from "../../scripts/tools/lib/notices-slim-common.mjs";

const arg = (name, dft) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? dft;
const BAK = arg("bak", "crm_bid_notices_documents_bak_20261015");
const LIVE = "bid_notices";
const OLD_PREV = "crm_bid_notices_retired_b2_20261015";
const c = await conn();

const [meta] = await c.query(
  `SELECT CREATE_TIME, UPDATE_TIME, TABLE_ROWS, ENGINE FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
  [BAK],
);
if (!meta.length) {
  console.error(`❌ ${BAK} 不在场 —— 现场与预期不符，本探针无需运行`);
  await c.end();
  process.exit(1);
}
console.log(`${BAK}：建表 ${meta[0].CREATE_TIME} · 最后写 ${meta[0].UPDATE_TIME} · 引擎 ${meta[0].ENGINE}`);
const cols = await columnsOf(c, BAK);
console.log(`列：${cols.map((x) => `${x.name}:${x.type}`).join(", ")}`);
const sample = await c.query(`SELECT * FROM \`${BAK}\` ORDER BY id LIMIT 3`);
for (const r of sample[0]) console.log(`  样本 ${JSON.stringify(r).slice(0, 200)}`);

// ② 集合是否同一批：把三张表按 id 对齐，数四象限（不重合就得另查它装的是哪一批）
const [set] = await c.query(
  `SELECT
     (SELECT COUNT(*) FROM \`${BAK}\`) bak_rows,
     (SELECT COUNT(*) FROM \`${BAK}\` b JOIN \`${LIVE}\` l ON l.id=b.id WHERE NOT (l.documents <=> b.documents)) bak_diff_live,
     (SELECT COUNT(*) FROM \`${LIVE}\` l JOIN \`${OLD_PREV}\` o ON o.id=l.id WHERE NOT (l.documents <=> o.documents)) live_diff_prev,
     (SELECT COUNT(*) FROM \`${LIVE}\` l JOIN \`${OLD_PREV}\` o ON o.id=l.id
        JOIN \`${BAK}\` b ON b.id=l.id WHERE NOT (l.documents <=> o.documents)) all_three_diff`,
);
console.log(`集合对照：${JSON.stringify(set[0])}`);
console.log(
  Number(set[0].all_three_diff) === Number(set[0].live_diff_prev) && Number(set[0].bak_rows) === Number(set[0].live_diff_prev)
    ? "⇒ bak 的 id 集合与「现网 vs 上一批旧位」差异集合完全重合：这是外部管道改写 documents 前留的旧值快照（他人产物，本作业不得处置）。"
    : "⇒ 集合不重合（bak 行数 / 差异行数见上一行）：需再查它到底装的是哪一批行。",
);

// ③ baseline 排除规则覆盖检查。⚠ 这份正则是从 scripts/tools/dump-schema-baseline.mjs 的 EXCLUDE_RES
// 手抄过来的：那边改了这里不会自动跟上（该脚本 import 即连库，无法直接引用其常量），
// 所以复跑后对「是否覆盖」这个结论要目视核对一遍。
const EXCLUDE_RES = [/__bak_/, /_bak\d/, /_(?:bak|backup|old|copy)_?\d*$/, /__new$/, /__drill$/, /_retired_/, /^crm_outreach_/];
console.log(EXCLUDE_RES.some((re) => re.test(BAK)) ? "⇒ 已被 dump-schema-baseline 的排除规则覆盖，不会混进基线。" : "❌ 未被覆盖：下一轮全量重导会把这张快照表当终态结构归档。");

await c.end();
