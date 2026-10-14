/**
 * 导出全库结构基线：MySQL 库终态 DDL → db/schema/baseline.sql
 *
 * @script scripts/tools/dump-schema-baseline.mjs
 * @background CI 的 e2e job 需要一个能建表的结构基线（见 db/schema/README.md）：应用侧不跑迁移
 *             （ALL_MIGRATIONS 已收敛为空），因此建表 DDL 只能来自 db/schema/*.sql。本脚本从
 *             **已跟踪的工具链**里补齐这条生成路径，避免基线靠手工粘贴而失真。
 * @scope      只读：仅查 information_schema 与 SHOW CREATE TABLE，不写库、不读业务数据。
 * @deterministic 表名升序输出、剔除 AUTO_INCREMENT 计数噪声、固定 LF，结构未变则重复执行
 *             产出逐字节一致（便于 diff 判断「基线是否漂移」）。
 * @usage      node --env-file=.env scripts/tools/dump-schema-baseline.mjs
 *             覆盖默认口径：
 *               OUT=db/schema/baseline.sql  输出路径（相对仓库根）
 *               EXCLUDE=<regex>            追加排除的表名匹配（与内置规则取并集）
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const OUT = process.env.OUT || "db/schema/baseline.sql";
// 影子/备份表（带 __bak_ 或日期后缀）是一次性切换留下的快照，不属于终态结构。
// __new 后缀是 ADR-0003 蓝绿切换的**在途影子表**：切换前重导会把半成品结构写进基线，
// 切换后它会原子改名成原表、自然消失，故必须排除（2026-10-12 机会表轮次踩过这个口）。
// __drill 后缀是全量对拍/回滚演练的影子表（如 crm_notice_attribution_nodes__drill），
// 它们按纪律保留作“落刀证明”（ADR-0014），同样不能进基线。
// crm_appointments：ADR-0011 已宣布退役（代码侧已完成），库侧 DROP 那一刀还没落。
// 重导会把它从 information_schema 带回来→进入 baseline 会违反“死表不参与 CI e2e”的口径。
// 库侧 DROP 落刀后删掉本行（下一轮重导自然归一，diff 应为空）。
const EXCLUDE_RES = [
  /__bak_/,
  /_bak\d/,
  /_(?:bak|backup|old|copy)_?\d*$/,
  /__new$/,
  /__drill$/,
  /_retired_/,
  /^crm_appointments$/,
];
const extra = process.env.EXCLUDE;
if (extra) EXCLUDE_RES.push(new RegExp(extra, "i"));

// 与 CI mysql:8.0 服务默认值一致的口径，写进文件头供人工比对
function buildHeader(total, kept, dropped) {
  return [
    "-- db/schema/baseline.sql —— 全库结构基线（E2E 建表唯一来源，CI e2e job 按文件名序导入）",
    "--",
    "-- 生成方式：node --env-file=.env scripts/tools/dump-schema-baseline.mjs",
    `-- 生成口径：仅 BASE TABLE，按表名升序，排除影子/备份表，剔除 AUTO_INCREMENT 计数。`,
    `--           源库共 ${total} 张，导出 ${kept} 张，排除 ${dropped} 张。`,
    "-- 目标内核：MySQL 8.0 / utf8mb4（服务端默认 collation utf8mb4_0900_ai_ci，",
    "--   innodb_ft_min_token_size=3、ngram_token_size=2 均为 8.0 出厂值，无需额外启动参数）。",
    "-- 注意：本文件只建结构、不含数据；业务数据的事实源是数据库本身，不入仓、不在代码里造。",
    "",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "",
  ].join("\n");
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
  });

  const dbName = process.env.DB_NAME;
  if (!dbName) throw new Error("缺少 DB_NAME：结构基线必须指定源库，避免误连即导出空文件");
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    [dbName],
  );

  const all = rows.map((r) => r.TABLE_NAME);
  const excluded = all.filter((t) => EXCLUDE_RES.some((re) => re.test(t)));
  const kept = all.filter((t) => !excluded.includes(t));

  const chunks = [buildHeader(all.length, kept.length, excluded.length)];
  for (const table of kept) {
    const [ddlRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    const ddl = ddlRows[0]["Create Table"];
    if (!ddl) throw new Error(`表 ${table} 未返回 Create Table，疑似视图/临时表混入`);
    chunks.push(
      `-- ── ${table} ──`,
      // 表选项里的自增计数随行数波动，非结构信息，去掉以保持可比对
      ddl.replace(/\s+AUTO_INCREMENT=\d+/g, "") + ";",
      "",
    );
  }
  chunks.push("SET FOREIGN_KEY_CHECKS = 1;", "");

  const sql = chunks.join("\n");
  const target = resolve(process.cwd(), OUT);
  const before = await readFile(target, "utf8").catch(() => null);
  if (before === sql) {
    console.log(`✓ ${OUT} 与源库结构一致（${kept.length} 张表），未改写文件`);
  } else {
    await writeFile(target, sql, "utf8");
    console.log(`✓ 已写出 ${OUT}：${kept.length} 张表`);
  }
  if (excluded.length) console.log(`  排除的影子/备份表：${excluded.join(", ")}`);

  await conn.end();
}

main().catch((err) => {
  console.error("[dump-schema-baseline] ✗ 失败:", err);
  process.exit(1);
});
