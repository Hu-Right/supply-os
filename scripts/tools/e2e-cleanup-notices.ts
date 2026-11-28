/**
 * E2E 公告数据清理（主表 / 服务表 / 宽表 / 译文 / Meilisearch）
 *
 * @module scripts/tools/e2e-cleanup-notices
 * @description 发布链的 RFQ 会镜像成公告（bid_notices / notice_public），
 *              只删 procurement_projects 时 RFQ 广场仍会从公告表/索引里读出来。
 *              本脚本按【E2E】标记 / OSPR-2026-0001xx 编号 / E2E 机构名清理整条链路。
 *
 * 用法：
 *   npx tsx scripts/tools/e2e-cleanup-notices.ts
 */
import { readFileSync } from "node:fs";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { deletePublicRows } from "../../src/lib/services/notice-public/build";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});

const WHERE = "(title LIKE '%【E2E】%' OR reference LIKE 'OSPR-2026-0001%' OR agency LIKE '%E2E%')";
const WHERE_PUBLIC = "(title LIKE '%【E2E】%' OR reference LIKE 'OSPR-2026-0001%' OR buyer_name LIKE '%E2E%')";

async function main(): Promise<void> {
  const ids = new Set<number>();

  const [notices] = await pool.query<RowDataPacket[]>(`SELECT id FROM bid_notices WHERE ${WHERE}`);
  for (const r of notices) ids.add(Number(r.id));

  const [pub] = await pool.query<RowDataPacket[]>(`SELECT notice_pk FROM notice_public WHERE ${WHERE_PUBLIC}`);
  for (const r of pub) ids.add(Number(r.notice_pk));

  const list = [...ids];
  if (list.length === 0) {
    console.log("[notices] 没有待清理的 E2E 公告");
    return;
  }
  const inClause = list.map(() => "?").join(",");

  const [t1] = await pool.query(`DELETE FROM notice_translations WHERE notice_id IN (${inClause})`, list);
  // 服务表唯一写入者是 notice-public/build.ts（N1 红线）：删除也走它的导出函数
  const publicDeleted = await deletePublicRows(pool, list);
  const [t4] = await pool.query(`DELETE FROM bid_notices WHERE id IN (${inClause})`, list);

  // Meilisearch：直接走 REST，避免 CLI 依赖 Next 运行时的 server-only 模块
  const host = String(process.env.MEILI_HOST ?? "").replace(/\/$/, "");
  const key = process.env.MEILI_MASTER_KEY ?? "";
  if (process.env.MEILI_ENABLED !== "off" && host) {
    try {
      const res = await fetch(`${host}/indexes/notices/documents/delete-batch`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(list),
      });
      if (!res.ok) console.warn(`[notices] Meili 删除失败 HTTP ${res.status}`);
    } catch (err) {
      console.warn("[notices] Meili 删除失败:", (err as Error).message);
    }
  }

  console.log(
    `[notices] ids=${list.join(",")}：translations ${(t1 as { affectedRows?: number }).affectedRows ?? 0}、public ${publicDeleted}、notices ${(t4 as { affectedRows?: number }).affectedRows ?? 0}`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[notices] 失败", err);
    await pool.end();
    process.exit(1);
  });

