/**
 * 供应商审核状态归一脚本：把 supplier.verify_status 统一为 pending
 *
 * 背景：
 *   - 历史上 supplier 表存在两套「审核中」取值：processing（企业自助注册/编辑）与
 *     pending（资源库手动收录），且外部 CRM 同步进来的约 7 万条老数据 verify_status 为 NULL。
 *   - 现统一口径：pending = 审核中（未通过，不进公开库）/ done = 通过 / rejected = 驳回。
 *   - 本脚本把 processing 与 NULL 一并批量置为 pending，使其必须经人工补全+审核通过后才显示。
 *
 * 用法（连接目标库由 .env 的 DB_* 决定，与 src/lib/db/pool.ts 同一组变量，务必确认连的是哪个库！）：
 *   npx tsx scripts/set-supplier-pending.ts          # 默认 dry-run，仅预览不改数据
 *   npx tsx scripts/set-supplier-pending.ts --apply   # 真正执行 UPDATE
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";
import { DbConfigSchema } from "../src/lib/db/db-config.js";

const APPLY = process.argv.includes("--apply");

const DB_CFG = DbConfigSchema.parse({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "crm",
});

type StatusRow = { verify_status: string | null; cnt: number };

async function countByStatus(conn: mysql2.Connection): Promise<StatusRow[]> {
  const [rows] = await conn.query(
    "SELECT verify_status, COUNT(*) AS cnt FROM supplier GROUP BY verify_status ORDER BY cnt DESC",
  );
  return (rows as StatusRow[]).map((r) => ({ verify_status: r.verify_status, cnt: Number(r.cnt) }));
}

function label(s: string | null): string {
  if (s === null) return "NULL(老数据)";
  return s;
}

async function main() {
  const conn = await mysql2.createConnection({
    host: DB_CFG.host,
    port: DB_CFG.port,
    user: DB_CFG.user,
    password: DB_CFG.password,
    database: DB_CFG.database,
  });

  console.log(`[set-supplier-pending] 已连接 ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database}`);
  console.log(`[set-supplier-pending] 模式：${APPLY ? "★ 执行写入 (--apply)" : "试运行（未加 --apply，不改数据）"}\n`);

  const before = await countByStatus(conn);
  console.log("改动前 supplier.verify_status 分布：");
  for (const r of before) console.log(`  ${label(r.verify_status).padEnd(16)} ${r.cnt}`);

  const toChange = before
    .filter((r) => r.verify_status === "processing" || r.verify_status === null)
    .reduce((sum, r) => sum + r.cnt, 0);
  console.log(`\n将被置为 pending 的行数（processing + NULL）：${toChange}`);

  if (!APPLY) {
    console.log("\n[dry-run] 未做任何修改。确认无误后加 --apply 执行：");
    console.log("  npx tsx scripts/set-supplier-pending.ts --apply");
    await conn.end();
    return;
  }

  const [result] = await conn.query(
    "UPDATE supplier SET verify_status = 'pending' WHERE verify_status = 'processing' OR verify_status IS NULL",
  );
  console.log(`\n实际影响行数（affectedRows）：${(result as { affectedRows: number }).affectedRows}`);

  const after = await countByStatus(conn);
  console.log("\n改动后 supplier.verify_status 分布：");
  for (const r of after) console.log(`  ${label(r.verify_status).padEnd(16)} ${r.cnt}`);

  await conn.end();
  console.log("\n[set-supplier-pending] 完成。");
}

main().catch((err) => {
  console.error("[set-supplier-pending] ✗ 失败:", err);
  process.exit(1);
});
