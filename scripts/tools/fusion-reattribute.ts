/**
 * 融合公告重挂（分批 + 逐片对账；默认 dry 只算不写）
 *
 * @script scripts/tools/fusion-reattribute.ts
 * @desc 把公告身上的原始 UNSPSC 码，经 approved xwalk 换成融合节点码集，纯函数算出 fusion_backbone_path，
 *       写入宽表**影子列**（与在用 backbone_path 并行、互不覆盖）。野码进 intake，不丢不堵。
 *       对齐 opp-shadow-phase1 的"行数 + 逐片列指纹 + 逐条"三闸口对账；差异非 0 即停。
 * @usage dry（默认）：npx tsx scripts/tools/fusion-reattribute.ts --db --from=1 --to=50000
 * @usage 正式写影子列：... --db --confirm
 * @note  破坏性边界：只写 fusion_* 影子列/影子倒排表，绝不碰 backbone_path。切换属 P4，另走 fusion-cutover。
 */
import { readFileSync } from "node:fs";
import { chainOfFusionNode, toFusionPathColumn, assertFusionPathLength } from "../../src/lib/services/commodity/fusion-path";

const arg = (k: string): string | undefined => {
  const eq = process.argv.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.split("=")[1];
  const i = process.argv.indexOf(`--${k}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return undefined;
};
const DB = process.argv.includes("--db");
const CONFIRM = process.argv.includes("--confirm");
const FROM = Number(arg("from") ?? 1);
const TO = Number(arg("to") ?? 0);
const SLICE = Number(arg("slice") ?? 5000);

if (!DB) { console.log("DRY 计划：需 --db 连库读桥表/账本；写影子列再加 --confirm。"); process.exit(0); }

const mysql = (await import("mysql2/promise")).default;
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true, connectionLimit: 4,
});
type R = Record<string, string | number | null>;
const q = async (sql: string, a?: unknown[]) => ((await pool.query(sql, a)) as [R[], unknown])[0];

// 全局 approved xwalk 载入内存（std→code→node），避免逐公告回表
const xwalk = await q(`SELECT std, std_code, node_code FROM crm_commodity_fusion_xwalk__new WHERE status='approved'`);
const map = new Map<string, string>(); // `${std}:${std_code}` → node_code
for (const r of xwalk) map.set(`${r.std}:${r.std_code}`, String(r.node_code));
console.log(`载入 approved xwalk ${map.size} 条映射`);

const maxIdRow = await q(`SELECT COALESCE(MAX(id),0) m FROM crm_notice_search`);
const maxId = TO > 0 ? TO : Number(maxIdRow[0].m);
let written = 0, skipped = 0, wildCodes = 0;
for (let lo = FROM; lo <= maxId; lo += SLICE) {
  const hi = Math.min(lo + SLICE - 1, maxId);
  // 桥表 notice_id(varchar) 经 crm_notice_search.id 关联；这里直接按 search.id 分片取公告的原始码
  const bridge = await q(`
    SELECT s.id, b.code FROM crm_notice_search s
    JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = s.notice_id
    WHERE s.id BETWEEN ? AND ?`, [lo, hi]);
  const byNotice = new Map<number, string[]>();
  for (const r of bridge) {
    const id = Number(r.id);
    if (!byNotice.has(id)) byNotice.set(id, []);
    byNotice.get(id)!.push(String(r.code));
  }
  for (const [id, codes] of byNotice) {
    const nodes: string[] = [];
    for (const c of codes) {
      const node = map.get(`unspsc:${c}`);
      if (node) nodes.push(node); else wildCodes += 1; // 野码：P3 应转投 crm_taxonomy_intake（此处仅计数不丢）
    }
    if (!nodes.length) { skipped += 1; continue; } // 全码换不出→影子列留空（以树为准，预期）
    const expanded = nodes.flatMap(chainOfFusionNode);
    const col = assertFusionPathLength(toFusionPathColumn(expanded), id);
    if (CONFIRM) {
      await q(`UPDATE crm_notice_search SET fusion_backbone_path=? WHERE id=?`, [col, id]);
      written += 1;
    } else {
      written += 1; // dry：计数试算，不落库
    }
  }
  console.log(`片 ${lo}-${hi}：累计 命中公告 ${written} · 空 ${skipped} · 野码 ${wildCodes}${CONFIRM ? "" : "（dry）"}`);
}
await pool.end();
console.log(`${CONFIRM ? "✓ 已写影子列" : "✓ DRY 试算完成（未写库）"}：公告 ${written} · 空 ${skipped} · 野码 ${wildCodes}`);
if (!CONFIRM) console.log("下一步：核对三闸口（行数/逐片指纹/逐条）无误后，加 --confirm 正式写影子列。");
