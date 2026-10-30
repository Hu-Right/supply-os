/**
 * 机构中文名 seed：把已人工判读的 buyer.name_zh 译名从仓库重放到库（换机/重建/回滚后可复放）。
 *
 * 为什么存在：判读成果原先只活在 runtime/（整目录 gitignore，R2 禁止入库），一次重装即全丢。
 * 本脚本把数据固化为同目录的 buyer-name-zh-seed.tsv（buyer_id ⇥ canonical_name ⇥ name_zh），
 * 让「人工判读」成为可版本化、可复放的资产，而不是本机临时产物。
 *
 * 口径（对齐门户口径，勿改）：
 *  - 只写 buyer.name_zh（译名唯一落位列表；旧翻译字典已退役，见 glossary 门禁说明）。
 *  - 绝不手写服务表 notice_public：红线 N1 规定服务表内容只能由唯一写入者链路重建，
 *    中文名落库后请跑 scripts/tools/notice-public-rebuild-buyers.ts 刷 buyer_name_cn。
 *  - 只填空值，不覆盖已有 name_zh（幂等：重复跑安全；库里已被人工改过的值以库为准）。
 *  - 双钥匙定位：id 命中且原名（空白归一后）一致才写；id 命中但原名实指不同 = ID 漂移，
 *    一律不自动写、只在报告里列出，交人工判读（机构归一化须逐条人工确认，不得脚本批量定名）。
 *    比对做空白归一：库里不少 canonical_name 内嵌换行，TSV 落档时已压成单空格，
 *    不归一会把「同一名字」误判成漂移并静默漏写。
 *  - 无 id 的行（服务表里还没解析出 buyer_id 的名称）按 canonical_name 精确匹配落位。
 *
 * 用法（仓库根执行，cwd 必须是根，否则读不到 .env 与 TSV）：
 *   npx tsx scripts/tools/buyer-name-zh-seed.ts            # DRY：只报命中/漂移/待填，不写库
 *   npx tsx scripts/tools/buyer-name-zh-seed.ts --apply    # 真正写 buyer.name_zh
 */
import { readFileSync } from "node:fs";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TSV = "scripts/tools/buyer-name-zh-seed.tsv";
const CHUNK = 500;
const CJK = /[\u4e00-\u9fff]/;
// 名字空白归一（TSV 已把内嵌换行压成单空格，比对两侧都归一才能对上）
const NORM = (e: string): string => `REGEXP_REPLACE(TRIM(${e}), '[[:space:]]+', ' ')`;

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

type Seed = { id: number; name: string; zh: string };
const seeds: Seed[] = [];
let dropped = 0;
for (const line of readFileSync(TSV, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [idRaw = "", name = "", zh = ""] = line.split("\t");
  const id = Number(idRaw);
  const z = zh.trim();
  const okZh = CJK.test(z) && z !== name.trim();
  const okKey = (Number.isInteger(id) && id > 0) || name.trim() !== "";
  if (okZh && okKey) seeds.push({ id: Number.isInteger(id) && id > 0 ? id : 0, name: name.trim(), zh: z });
  else dropped += 1;
}
console.log(`[seed] TSV ${seeds.length + dropped} 行 · 准入 ${seeds.length}（id 口径 ${seeds.filter((s) => s.id > 0).length} · 仅名称 ${seeds.filter((s) => s.id === 0).length}）· 拒收 ${dropped}`);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});

try {
  // 列宽照抄真实 DDL（buyer.canonical_name / name_zh 均 varchar(500)）；索引用 191 前缀避开 utf8mb4 键长上限
  await conn.query("DROP TEMPORARY TABLE IF EXISTS tmp_buyer_name_zh");
  await conn.query(
    "CREATE TEMPORARY TABLE tmp_buyer_name_zh (buyer_id bigint unsigned not null, canonical_name varchar(500) not null, name_zh varchar(500) not null, KEY ix_id (buyer_id), KEY ix_name (canonical_name(191))) ENGINE=InnoDB",
  );
  for (let i = 0; i < seeds.length; i += CHUNK) {
    const chunk = seeds.slice(i, i + CHUNK);
    const ph = chunk.map(() => "(?,?,?)").join(",");
    await conn.query(`INSERT INTO tmp_buyer_name_zh (buyer_id, canonical_name, name_zh) VALUES ${ph}`, chunk.flatMap((s) => [s.id, s.name, s.zh]));
  }

  const one = async (sql: string): Promise<Record<string, unknown>> => {
    const [rows] = await conn.query<RowDataPacket[]>(sql);
    return rows[0] ?? {};
  };

  const byId = await one(`SELECT
      SUM(t.buyer_id>0) id_rows,
      SUM(t.buyer_id>0 AND b.buyer_id IS NULL) id_missing,
      SUM(t.buyer_id>0 AND b.buyer_id IS NOT NULL AND ${NORM("b.canonical_name")}<>${NORM("t.canonical_name")}) id_drift,
      SUM(t.buyer_id>0 AND b.buyer_id IS NOT NULL AND ${NORM("b.canonical_name")}=${NORM("t.canonical_name")} AND (b.name_zh IS NULL OR b.name_zh='')) id_fillable,
      SUM(t.buyer_id>0 AND b.buyer_id IS NOT NULL AND ${NORM("b.canonical_name")}=${NORM("t.canonical_name")} AND b.name_zh<>'') id_already
    FROM tmp_buyer_name_zh t LEFT JOIN buyer b ON b.buyer_id=t.buyer_id`);
  const byName = await one(`SELECT
      SUM(t.buyer_id=0) name_rows,
      SUM(t.buyer_id=0 AND b.buyer_id IS NULL) name_unmatched,
      SUM(t.buyer_id=0 AND b.buyer_id IS NOT NULL AND (b.name_zh IS NULL OR b.name_zh='')) name_fillable,
      COUNT(b.buyer_id) name_hit_rows
    FROM tmp_buyer_name_zh t LEFT JOIN buyer b ON b.canonical_name=t.canonical_name AND t.buyer_id=0`);
  console.log("[seed] id 口径:", JSON.stringify(byId));
  console.log("[seed] 名称口径:", JSON.stringify(byName));

  const drift = await conn.query<RowDataPacket[]>(
    `SELECT t.buyer_id, t.canonical_name seed_name, t.name_zh seed_zh, b.canonical_name db_name
       FROM tmp_buyer_name_zh t JOIN buyer b ON b.buyer_id=t.buyer_id
      WHERE t.buyer_id>0 AND ${NORM("b.canonical_name")}<>${NORM("t.canonical_name")} LIMIT 10`,
  );
  const driftRows = drift[0];
  if (driftRows.length) {
    console.log(`[seed] ID 漂移样例（这些一律不自动写，需人工判读）：`);
    for (const r of driftRows) console.log(`  #${r.buyer_id} seed「${r.seed_name}」≠ 库「${r.db_name}」→ 译名「${r.seed_zh}」`);
  }

  if (APPLY) {
    const [b1] = await conn.query<ResultSetHeader>(
      `UPDATE buyer b JOIN tmp_buyer_name_zh t ON t.buyer_id=b.buyer_id
          SET b.name_zh=t.name_zh
        WHERE t.buyer_id>0 AND ${NORM("b.canonical_name")}=${NORM("t.canonical_name")} AND (b.name_zh IS NULL OR b.name_zh='')`,
    );
    const [b2] = await conn.query<ResultSetHeader>(
      `UPDATE buyer b JOIN tmp_buyer_name_zh t ON t.buyer_id=0 AND b.canonical_name=t.canonical_name
          SET b.name_zh=t.name_zh
        WHERE b.name_zh IS NULL OR b.name_zh=''`,
    );
    console.log(`[seed] 已写 buyer.name_zh：id 口径 ${b1.affectedRows} 行 · 名称口径 ${b2.affectedRows} 行`);
    console.log("[seed] 服务表未动。刷新 buyer_name_cn 请跑：npx tsx scripts/tools/notice-public-rebuild-buyers.ts");
  } else {
    console.log("[seed] DRY：加 --apply 才写 buyer.name_zh（本脚本不碰服务表）");
  }
} finally {
  await conn.end();
}
