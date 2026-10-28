/**
 * bid_opportunities 精简取证 · 可重跑证据脚本
 *
 * 一次跑齐精简方案依赖的六项事实，输出到控制台（判据全部写进
 * docs/数据库设计/bid_opportunities-投标商机表.md，本文是复跑入口）：
 *   1) 列清单与逐列充实度（有值行数 / 去重值数 / 非空样本）
 *   2) 体积按列归因（证明「砍小列不省空间，长文本才是主体」）
 *   3) 状态族等价性（audit_status / review_status / is_qualified / status / is_expired）
 *   4) 与公告主表同名列的重复率（哪些是纯镜像、哪些各自加工）
 *   5) 索引实态 + 重复组 + 前缀覆盖关系
 *   6) 国际采购 17 列的唯一有值行归属（数据可信度判据）
 *
 * 用法：node --env-file=.env scripts/tools/opp-slim-evidence.mjs [表名]
 * 只读：全程 START TRANSACTION READ ONLY，不写一个字。
 * ⚠️ 库归属（2026-10-12 实测）：`.env` 的 127.0.0.1:3307 是 **云生产库** 的 SSH 隧道本地端口
 *   （MySQL 自报 `@@hostname=lavm-pn1wgls09p` / `@@port=3306`，口径同 docs/adr/0012），
 *   不是本机镜像库——所以本脚本读到的就是现网数字，但写操作一律禁止在这里做。
 */
import mysql from "mysql2/promise";
import { RETIRED_INTL_COLUMNS } from "./opp-slim-plan.mjs";

const TABLE = process.argv[2] ?? "bid_opportunities";
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
await conn.query("START TRANSACTION READ ONLY");
const q = async (sql) => (await conn.query(sql))[0];

const cols = await q(
  `SELECT COLUMN_NAME name, DATA_TYPE type, EXTRA extra, COLUMN_COMMENT comment
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${TABLE}'
    ORDER BY ORDINAL_POSITION`,
);
const total = (await q(`SELECT COUNT(*) n FROM \`${TABLE}\``))[0].n;
console.log(`\n===== ${TABLE}：${total} 行 / ${cols.length} 列 =====`);

// 1) 逐列充实度 + 2) 体积归因：一次聚合跑齐
const filled = cols.map((c) => `SUM(\`${c.name}\` IS NOT NULL AND TRIM(CAST(\`${c.name}\` AS CHAR)) <> '') \`${c.name}_f\``);
const bytes = cols.map((c) => `SUM(OCTET_LENGTH(CAST(\`${c.name}\` AS CHAR))) \`${c.name}_b\``);
const distinct = cols.map((c) => `COUNT(DISTINCT \`${c.name}\`) \`${c.name}_d\``);
const agg = (await q(`SELECT ${[...filled, ...bytes, ...distinct].join(", ")} FROM \`${TABLE}\``))[0];
const samples = {};
for (const c of cols) {
  const r = await q(
    `SELECT LEFT(CAST(\`${c.name}\` AS CHAR), 60) s FROM \`${TABLE}\`
      WHERE \`${c.name}\` IS NOT NULL AND TRIM(CAST(\`${c.name}\` AS CHAR)) <> '' LIMIT 1`,
  );
  samples[c.name] = String(r[0]?.s ?? "").replace(/\s+/g, " ");
}
const byteTotal = cols.reduce((s, c) => s + Number(agg[`${c.name}_b`] ?? 0), 0);
console.log(`列字节合计 ${(byteTotal / 1048576).toFixed(1)} MB（表 DATA_LENGTH 另含行头与 TEXT 溢出页开销）\n`);
console.log("列名".padEnd(26), "类型".padEnd(10), "有值行".padStart(8), "去重".padStart(7), "MB".padStart(8), " 注释 | 样本");
for (const c of [...cols].sort((a, b) => Number(agg[`${b.name}_b`] ?? 0) - Number(agg[`${a.name}_b`] ?? 0))) {
  console.log(
    `${c.name.padEnd(26)} ${(c.type + (c.extra.includes("GENERATED") ? "*" : "")).padEnd(10)}` +
      `${String(agg[`${c.name}_f`] ?? 0).padStart(8)} ${String(agg[`${c.name}_d`] ?? 0).padStart(7)}` +
      `${(Number(agg[`${c.name}_b`] ?? 0) / 1048576).toFixed(2).padStart(8)} ${c.comment} | ${samples[c.name]}`,
  );
}

// 3) 状态族
console.log("\n===== 状态族交叉（能否互相推导）=====");
console.table(await q(
  `SELECT audit_status, review_status, is_qualified, status, is_expired, COUNT(*) n
     FROM \`${TABLE}\` GROUP BY 1,2,3,4,5 ORDER BY n DESC`,
));
console.log("等价性:", JSON.stringify(await q(
  `SELECT SUM((is_qualified = 1) <> (audit_status = 1)) qualified_vs_audit1,
          SUM((review_status = 'approved') <> (is_qualified = 1)) approved_vs_qualified,
          SUM(is_expired = 1 AND deadline_sec > 0 AND deadline_sec < UNIX_TIMESTAMP(NOW())) expired_ok,
          SUM(is_expired = 0 AND deadline_sec > 0 AND deadline_sec < UNIX_TIMESTAMP(NOW())) stale_unmarked
     FROM \`${TABLE}\``,
)));

// 4) 与主表同名列重复率
console.log("\n===== 与 bid_notices 同名列重复率（配对行）=====");
const mirror = (await q(
  `SELECT COUNT(*) paired,
          SUM(o.title <=> n.title) title_same, SUM(o.agency <=> n.agency) agency_same,
          SUM(o.published_date <=> n.published_date) published_same, SUM(o.deadline <=> n.deadline) deadline_same,
          SUM(o.deadline_ts <=> n.deadline_ts) deadline_ts_same, SUM(o.industry <=> n.industry) industry_same,
          SUM(o.registration_level <=> n.registration_level) reglevel_same, SUM(o.country <=> n.country) country_same,
          SUM(o.notice_type <=> n.notice_type) type_same, SUM(o.estimated_value <=> n.estimated_value) value_same,
          SUM(o.description <=> n.description) desc_same
     FROM \`${TABLE}\` o JOIN bid_notices n ON n.notice_id = o.source_notice_id`,
))[0];
console.log(JSON.stringify(mirror));

// 5) 索引实态
const idxRows = await q(
  `SELECT INDEX_NAME name, SEQ_IN_INDEX seq, COLUMN_NAME col FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${TABLE}' ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
);
const byName = new Map();
for (const r of idxRows) byName.set(r.name, [...(byName.get(r.name) ?? []), r.col]);
const list = [...byName.entries()];
console.log(`\n===== 索引 ${list.length} 个 =====`);
for (const [n, cs] of list.sort()) console.log(`  ${n.padEnd(30)} ${cs.join(",")}`);
const dup = new Map();
for (const [n, cs] of list) dup.set(cs.join("|"), [...(dup.get(cs.join("|")) ?? []), n]);
for (const [k, ns] of dup) if (ns.length > 1) console.log(`  ⚠ 定义完全相同：[${k}] ${ns.join(", ")}`);
for (const [a, ac] of list) for (const [b, bc] of list) {
  if (a !== b && ac.length < bc.length && bc.slice(0, ac.length).join("|") === ac.join("|")) {
    console.log(`  ⚠ 前缀被覆盖：${a}(${ac.join(",")}) ⊂ ${b}(${bc.join(",")})`);
  }
}
const meta = (await q(
  `SELECT CREATE_TIME, UPDATE_TIME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, AUTO_INCREMENT
     FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${TABLE}'`,
))[0];
console.log("表元信息:", JSON.stringify(meta));

// 6) 国际采购 17 列归属
console.log("\n===== 国际采购 17 列（迁移 088）=====");
const intlHas = cols.filter((c) => RETIRED_INTL_COLUMNS.includes(c.name));
if (intlHas.length !== RETIRED_INTL_COLUMNS.length) {
  console.log(`  列数不符：现网 ${intlHas.length} vs 清单 ${RETIRED_INTL_COLUMNS.length}（结构已漂移）`);
} else {
  const rows = await q(
    `SELECT id, source_notice_id, source_platform, country, LEFT(title,60) title, COUNT(*) OVER() n
       FROM \`${TABLE}\` WHERE ${RETIRED_INTL_COLUMNS.map((c) => `${c} IS NOT NULL`).join(" OR ")} LIMIT 5`,
  );
  console.log(`  有值行数: ${(await q(`SELECT COUNT(*) n FROM \`${TABLE}\` WHERE ${RETIRED_INTL_COLUMNS.map((c) => `${c} IS NOT NULL`).join(" OR ")}`))[0].n}`);
  console.log("  有值行身份:", JSON.stringify(rows));
  console.log("  字节合计:", (await q(`SELECT ${RETIRED_INTL_COLUMNS.map((c) => `SUM(OCTET_LENGTH(CAST(\`${c}\` AS CHAR))) \`${c}\``).join(", ")} FROM \`${TABLE}\``))[0]);
}

await conn.query("ROLLBACK");
await conn.end();
