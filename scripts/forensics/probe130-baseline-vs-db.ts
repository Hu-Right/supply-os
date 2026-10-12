/**
 * 只读校验：本机库的基表清单 vs 仓库 db/schema/baseline.sql 的表清单
 * 用途：crm_appointments 退役后，证明手工摘除的基线与库实际结构一致（不多不少）
 * 用法：npx tsx scripts/forensics/probe130-baseline-vs-db.ts（只读、可重跑；任何表退役后都能拿它对账基线）
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const db = process.env.DB_NAME ?? "crm";
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: db,
});
const [rows] = (await conn.query(
  `SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY t`,
  [db],
)) as unknown as [{ t: string }[], unknown];
await conn.end();

// 基线里的表名来自 `-- ── 表名 ──` 分节注释（dump 脚本的写法）
const sql = readFileSync(new URL("../../db/schema/baseline.sql", import.meta.url), "utf8");
const inBaseline: string[] = [...sql.matchAll(/^-- ── (.+?) ──$/gm)].map((m) => m[1]!);
const inDb: string[] = rows.map((r) => r.t);
// dump 的内置排除规则：影子/备份表不进基线，比对前先同样滤掉
const EXCLUDE = [/__bak_/, /_bak\d/, /_(?:bak|backup|old|copy)_?\d*$/];
const dbKept = inDb.filter((t) => !EXCLUDE.some((re) => re.test(t)));
const dbExcluded = inDb.filter((t) => EXCLUDE.some((re) => re.test(t)));

const onlyDb = dbKept.filter((t) => !inBaseline.includes(t));
const onlySql = inBaseline.filter((t) => !dbKept.includes(t));
console.log(`库内基表 ${inDb.length} 张（排除影子/备份 ${dbExcluded.length}：${dbExcluded.join(", ") || "无"}）⇒ 应进基线 ${dbKept.length} 张`);
console.log(`baseline.sql 里 ${inBaseline.length} 张`);
console.log(`只在库里、基线缺的：${onlyDb.join(", ") || "无"}`);
console.log(`只在基线、库里没有的：${onlySql.join(", ") || "无"}`);
console.log(`含 crm_appointments 吗：库=${inDb.includes("crm_appointments")}｜退役名=${inDb.some((t) => t.includes("retired"))}｜基线=${inBaseline.includes("crm_appointments")}`);
console.log(onlyDb.length === 0 && onlySql.length === 0 ? "\n✅ 两边逐表一致" : "\n⚠️ 两边有差异（看上面两行）");
