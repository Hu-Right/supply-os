/**
 * 买家中文名修正（2026-11-26，方案 A：纯中文）
 *
 * 只处理 6 个 active 买家；63 条 inactive 历史行不翻译（不展示、不参与匹配）。
 *
 * 流程（分步执行，便于逐步观察）：
 *   npx tsx scripts/tools/buyer-zh-apply.ts             # 备份旧值 → 清空这 6 条 → 追加 seed 台账
 *   npx tsx scripts/tools/buyer-name-zh-seed.ts --apply # 用台账回放填充（带纯中文准入校验）
 *   npx tsx scripts/tools/buyer-zh-apply.ts --refresh   # 重建这 6 个买家的服务表投影
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";

const TARGETS: Array<{ id: number; zh: string }> = [
  { id: 114037, zh: "法国三艾弗地产公司" },
  { id: 114113, zh: "孟加拉建设与维护部" },
  { id: 115848, zh: "阿巴乌雷阿盖纳市政厅" },
  { id: 116402, zh: "公共工程执行工程师办公室（销售）" },
  { id: 116944, zh: "越南三二空军工厂" },
  { id: 116974, zh: "乌克兰七一四七部队" },
];
const TSV = "scripts/tools/buyer-name-zh-seed.tsv";
const BACKUP = "/root/bak-buyer-zh-20261126.tsv";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

const ids = TARGETS.map((t) => t.id);
const [rows] = await pool.query<RowDataPacket[]>(
  `SELECT buyer_id, canonical_name, name_zh FROM buyer WHERE buyer_id IN (${ids.map(() => "?").join(",")})`,
  ids,
);
const found = new Map(rows.map((r) => [Number(r.buyer_id), r]));
for (const t of TARGETS) if (!found.has(t.id)) throw new Error(`buyer_id ${t.id} 不存在`);

if (process.argv.includes("--refresh")) {
  const { refreshBuyerProjection } = await import("../../src/lib/services/buyer/refresh");
  const res = await refreshBuyerProjection(pool, { buyerIds: ids });
  console.log(`[refresh] 公告 ${res.noticeIds.length} 条 · 服务表 ${res.rewritten} · 宽表 ${res.wideSynced}`);
} else {
  // ① 备份旧值（可回滚）
  const backup = rows.map((r) => `${r.buyer_id}\t${r.canonical_name}\t${r.name_zh ?? ""}`).join("\n") + "\n";
  writeFileSync(BACKUP, backup, "utf8");
  console.log(`[backup] 旧值已写入 ${BACKUP}`);

  // ② 清空这 6 条的 name_zh，交给 seed 回放（保持「唯一写入入口 + 准入校验」）
  await pool.query(
    `UPDATE buyer SET name_zh = NULL WHERE buyer_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  console.log(`[clear] 已清空 ${ids.length} 条 name_zh`);

  // ③ 追加 seed 台账（同一 buyer_id 已存在则跳过，避免重复行）
  const existing = new Set(
    readFileSync(TSV, "utf8").split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.split("\t")[0])
      .filter((v) => /^\d+$/.test(v)),
  );
  let appended = 0;
  for (const t of TARGETS) {
    if (existing.has(String(t.id))) continue;
    const raw = String(found.get(t.id)!.canonical_name ?? "");
    const name = raw.replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    appendFileSync(TSV, `${t.id}\t${name}\t${t.zh}\n`, "utf8");
    appended += 1;
  }
  console.log(`[ledger] 追加 seed 台账 ${appended} 行（已存在则跳过）`);
}

await pool.end();
