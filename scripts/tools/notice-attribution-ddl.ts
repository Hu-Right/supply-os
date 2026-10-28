/**
 * 公告品目归属落点表：幂等 DDL
 *
 * 做什么：建 `notice_attribution_nodes` —— 旧品类字典码退役后公告品目归属的**唯一事实源**，
 *         一行 = 「某公告在某节点上有最深落点」。宽表 `backbone_path` 继续是派生列，
 *         由 `src/lib/services/commodity/attribution.ts` 的 `pathOfLandingNodes()` 补祖先产出，
 *         `buildWideRow` 依旧是唯一写入方（ADR-0007 前提不废，只是换了输入源）。
 *
 * 存什么 / 不存什么（都是有意的）：
 *   - 只存最深落点，**不存祖先链**：祖先由节点码唯一决定（`chainOfNode` 纯切片，BB1 钉的
 *     不变量）。存两份就是第二个事实源——树正名或挪归属改一次，落库的旧链就悄悄对不上。
 *   - `level` 冗余存储但不作判据：码长唯一决定层级，读侧一律现算（与 commodity_backbone
 *     不存 level 同一条纪律）；这一列只为人工排查时肉眼分组。
 *   - 不建外键到 bid_notices：本表由灌入脚本与 AI worker 写入，公告行可能尚未同步；
 *     与已退役的旧公告×字典码桥表同一做法（那张表也只有索引没有外键；已于 2026-10-14 退役）。
 *   - notice_pk 用**内部主键**而不是 notice_id 外部编号：实测外部编号有撞号
 *     （bid_opportunities.source_notice_id 与宽表 id 域相撞，见 match-nodes.ts:16-20），拿它接会接错行。
 *   - 排序规则跟库默认 utf8mb4_0900_ai_ci，**不上 _bin**：本表的 node_code 迟早要和
 *     commodity_backbone.code / backbone_path 直接比较，两侧 collation 不同会让 MySQL
 *     转列 —— 转列就是函数作用在列上，索引静默失效（与 commodity-notice-nodes-ddl.ts 同结论）。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-attribution-ddl.ts --preflight
 *   npx tsx scripts/tools/notice-attribution-ddl.ts --apply --yes
 *   npx tsx scripts/tools/notice-attribution-ddl.ts --drop-table --yes   # 回滚：仅当表内只有 legacy_tag
 *   npx tsx scripts/tools/notice-attribution-ddl.ts --table crm_notice_attribution_nodes__drill --apply --yes   # 影子演练
 *
 * 铁律：只建这一张新表；不动宽表、不动桥表；先查元数据再建（等价 IF NOT EXISTS 幂等）；
 *       已存在时只核对列形制，不隐式改类型。
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { assertDroppable, assertTableName } from "../../src/lib/services/commodity/attribution-contract";

/** 正名表：--drop-table 对它的处置只看身份，不看内容（见下面 DROP 分支的注释） */
const CANON = "notice_attribution_nodes";

const APPLY = process.argv.includes("--apply");
const DROP = process.argv.includes("--drop-table");
const YES = process.argv.includes("--yes");
const PREFLIGHT = process.argv.includes("--preflight");

if ((APPLY || DROP) && !YES) {
  console.error("✗ --apply / --drop-table 必须显式带 --yes（人工闸口）");
  process.exit(1);
}
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

/**
 * 表名可覆盖：--drop-table 只应落在影子/演练表上，正名表由下面的 assertDroppable 兜。
 * 同时吃 `--table=x` 与 `--table x`：递错形式被静默忽略的话，操作员以为在删影子表
 * 而实际删的是正名表 —— 那是本文件存在的主要理由之一，不能自己留这个洞。
 */
function argTable(): string {
  const eq = process.argv.find((a) => a.startsWith("--table="));
  if (eq) {
    const v = eq.slice("--table=".length);
    if (!v) {
      console.error("✗ --table= 后面不许空：空值会静默回落到正名表，而本脚本正是拿来删表的");
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
  return CANON;
}
const TABLE = argTable();
try {
  assertTableName(TABLE);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}

const DDL = `CREATE TABLE \`${TABLE}\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`notice_pk\` int unsigned NOT NULL COMMENT 'bid_notices.id 内部主键；不用 notice_id 外部编号（实测撞号）',
  \`node_code\` varchar(40) NOT NULL COMMENT '最深落点 UGT-*；祖先不落库，由 attribution.pathOfLandingNodes 现算',
  \`level\` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '由 node_code 码长唯一决定，仅冗余展示用，不作任何判据',
  \`confidence\` decimal(5,2) NOT NULL DEFAULT 0 COMMENT 'AI 置信；legacy_tag 固定 1.00',
  \`source\` varchar(20) NOT NULL COMMENT 'legacy_tag / ai / manual',
  \`model\` varchar(64) NOT NULL DEFAULT '' COMMENT '产出模型标识，审计用',
  \`evidence_text\` varchar(1000) DEFAULT NULL COMMENT '原文证据',
  \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_notice_node\` (\`notice_pk\`,\`node_code\`),
  KEY \`idx_source_notice\` (\`source\`,\`notice_pk\`),
  KEY \`idx_node\` (\`node_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告品目归属落点（唯一事实源，替代旧品类字典桥表口径）'`;

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4",
});
// 单连接：会话变量只对当次连接生效，不 await 就是拿没排队的会话去建表
await conn.query(`SET SESSION lock_wait_timeout = 15`);
const one = async <T = Record<string, unknown>>(sql: string): Promise<T> =>
  ((await conn.query(sql))[0] as unknown as T[])[0];

// ── 1. 现状 ──
const tbl = await one<{ n: number }>(
  `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='${TABLE}'`,
);
console.log(`表 ${TABLE}：${Number(tbl.n) > 0 ? "已存在" : "不存在"}`);

// 派生列必须在场：宽表还没有 backbone_path 就是环境不对（本表是它的上游事实源）
const srcCol = await one<{ n: number }>(
  `SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='notice_search' AND column_name='backbone_path'`,
);
if (Number(srcCol.n) === 0) {
  console.log("✗ 宽表没有 backbone_path 列：本库还没跑过上一轮 DDL，先确认环境再建表");
  await conn.end();
  process.exit(1);
}
const src = await one<{ notices: number }>(
  `SELECT COUNT(*) notices FROM notice_search WHERE backbone_path IS NOT NULL AND backbone_path <> ''`,
);
console.log(`灌入源：${src.notices} 条公告已有归属列（本表建成后由 backfill 脚本压出落点）`);

const db = await one<{ d: string }>(`SELECT DATABASE() d`);
console.log(`连的是库：${db.d}@${process.env.DB_HOST ?? "127.0.0.1"}:${process.env.DB_PORT ?? "3306"}`);

if (Number(tbl.n) > 0) {
  const cols = await conn.query(
    `SELECT column_name c, data_type t, column_type ct, is_nullable nu
     FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='${TABLE}' ORDER BY ordinal_position`,
  );
  for (const r of (cols[0] as unknown as Array<Record<string, string>>)) {
    console.log(`  现有列 ${r.c} ${r.ct} ${r.nu === "YES" ? "NULL" : "NOT NULL"}`);
  }
  const idx = await conn.query(
    // non_unique 必须聚合：本库 sql_mode 含 ONLY_FULL_GROUP_BY，直接选它会在 1055 上挂掉
    `SELECT index_name i, GROUP_CONCAT(column_name ORDER BY seq_in_index) c, MAX(non_unique) u
     FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='${TABLE}' GROUP BY index_name`,
  );
  for (const r of (idx[0] as unknown as Array<Record<string, string | number>>)) {
    console.log(`  现有索引 ${r.i} (${r.c}) ${Number(r.u) === 0 ? "UNIQUE" : ""}`);
  }
  // uk_notice_node 必须真的 UNIQUE：幂等重灌全靠 INSERT IGNORE 撞它，建成普通索引就会灌出重复行
  const uniq = (idx[0] as unknown as Array<Record<string, string | number>>).find((r) => r.i === "uk_notice_node");
  if (!uniq || Number(uniq.u) !== 0) {
    console.log("✗ uk_notice_node 不在场或非 UNIQUE：重灌会出重复行，本脚本不隐式改建，请人工定");
    await conn.end();
    process.exit(1);
  }
}

// ── 2. 动作 ──
if (DROP) {
  // 身份线优先于内容线（ADR-0014 纪律 1）：正名表连「此刻只剩 legacy_tag」都不许删。
  // 并发方有 `DELETE ... WHERE source='ai_content'` 这类清理动作，普查与 DROP 之间存在
  // legacy-only 的合法瞬间；拿“当下有数据”当安全依据就是赌 race，那一瞬的 DROP
  // 会把 638k 行的唯一事实源、连同窗口里刚写进去的新行一起没掉。
  if (TABLE === CANON) {
    console.error(
      `✗ --drop-table 拒绝作用在正名表 ${CANON}：要演练回滚请 --table <影子表>；\n` +
        `  真要退役正名表，那属于 R6'（删表）的人工流程，不靠这个开发期脚本。`,
    );
    await conn.end();
    process.exit(1);
  }
  if (Number(tbl.n) === 0) {
    console.log(`\n--drop-table：表 ${TABLE} 本就不存在，无需删（不报错：幂等）`);
  } else {
    const [rows] = await conn.query(`SELECT source s, COUNT(*) n FROM \`${TABLE}\` GROUP BY source`);
    const census: Record<string, number> = {};
    for (const r of rows as unknown as Array<{ s: string; n: number }>) census[String(r.s)] = Number(r.n);
    // 硬闸在 DROP 之前、且不可被 --yes 越过：legacy_tag 是派生数据（删了能重灌），其余都是换不回来的事实。
    // 故意不在这里给 bypass 开关：能绕过的闸口等于没有闸口（ADR-0014 纪律 1）。
    assertDroppable(census);
    console.log(`\n--drop-table：DROP TABLE ${TABLE}（普查 ${JSON.stringify(census)}，全部为可重灌的派生数据）`);
    await conn.query(`DROP TABLE \`${TABLE}\``);
    console.log("✓ 已删除");
  }
} else if (APPLY) {
  if (Number(tbl.n) > 0) {
    console.log("\n--apply：表已存在且列形制核对通过，本轮不动（幂等）");
  } else {
    console.log("\n--apply：建表");
    await conn.query(DDL);
    console.log(`✓ 已建表 ${TABLE}`);
  }
} else {
  console.log(PREFLIGHT ? "\n✓ preflight 通过（本轮只读，未发任何写语句）"
    : "\n未带 --apply：本轮只读。要建表请跑 --apply --yes");
}
await conn.end();
