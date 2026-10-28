/**
 * 野码「人工锚定」落点提交器（混合 A 的执行器 · 零 API · 默认 dry · 双闸 · 只锚零落点）
 *
 * 用途：我（会话里的 AI）按公告内容人工判定 UGT 落点后，把「pk → 已存在节点码」这层判定
 *       写进事实源 notice_attribution_nodes(source='ai_content')，并把 intake pending 翻 resolved。
 *       不调用任何 LLM/付费 API —— 判定是人做的，本脚本只负责【带闸落地】。
 *
 * 铁律（同 R3 生产者，防上次回滚的两类问题）：
 *   1) 禁造码/防幻觉：每个 code 必须在 commodity_backbone(status=1)，命中不到就整条拒写；
 *   2) 防父子冗余(BB15b)：只写「当前零落点」的公告（已有落点默认跳过，--force 才覆盖）；
 *   3) 幂等：INSERT IGNORE（2026-10-14 由 ODKU 改起，ADR-0014 结论 7：撞 uk_notice_node
 *      即既有落点保留原行，绝不覆盖 source/model/confidence 审计线）；重跑不改口径；
 *   4) 前提：落点表已是唯一事实源（R2 已永久转正、`ATTRIBUTION_READ` flag 已下线，列值恒由 buildWideRow 按落点重算），
 *      写入即干净生效；不再需要判 flag。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-attribution-manual-anchor.ts                     # dry：校验+打印写计划
 *   npx tsx scripts/tools/notice-attribution-manual-anchor.ts --apply --yes       # 写库（R2 上线后）
 *   --anchors <file.json>   锚点清单路径（默认 temp/manual-anchors-1.json）
 * 锚点清单元素：{ pk, notice_id, code, confidence, reason }
 */
import { existsSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const YES = process.argv.includes("--yes");
const FORCE = process.argv.includes("--force");
const ai = process.argv.indexOf("--anchors");
const ANCHORS_FILE = ai > 0 && process.argv[ai + 1] ? process.argv[ai + 1] : "temp/manual-anchors-1.json";
const SRC = "ai_content";
const MODEL = "manual_anchor";
const TABLE = "notice_attribution_nodes";

if (APPLY && !YES) { console.error("✗ --apply 必须带 --yes（人工闸口）；先跑 dry 出写计划"); process.exit(1); }
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, ""); }
if (!existsSync(ANCHORS_FILE)) { console.error(`✗ 找不到锚点清单：${ANCHORS_FILE}`); process.exit(1); }

type Anchor = { pk: number; notice_id: string; code: string; confidence?: number; reason?: string };
const anchors = JSON.parse(readFileSync(ANCHORS_FILE, "utf8")) as Anchor[];

const pool = await mysql.createPool({ host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", connectionLimit: 2 });
const q = async (sql: string, p?: unknown[]): Promise<Record<string, unknown>[]> => (await pool.query(sql, p))[0] as Record<string, unknown>[];

const [env] = await q(`SELECT @@hostname host, DATABASE() db`);
console.log(`目标库：${env.host}/${env.db}（${process.env.DB_HOST}:${process.env.DB_PORT}）  模式=${APPLY ? "★APPLY(写库)" : "dry"}  锚点=${anchors.length}  force=${FORCE}`);

type Plan = { pk: number; code: string; level: number; conf: number; reason: string; nid: string };
const plans: Plan[] = [];
const rejected: string[] = [];
for (const a of anchors) {
  const inTree = await q(`SELECT level FROM commodity_backbone WHERE code = ? AND status = 1`, [a.code]);
  if (!inTree.length) { rejected.push(`${a.pk}/${a.code}: 树外或非法(拒写)`); continue; }
  const level = Number(inTree[0].level);
  // notice_id 与 pk 一致性校验（防错挂）
  const ns = await q(`SELECT id FROM bid_notices WHERE notice_id = ?`, [a.notice_id]);
  if (!ns.length || Number(ns[0].id) !== a.pk) { rejected.push(`${a.pk}/${a.notice_id}: notice_id 与 pk 不匹配(拒写)`); continue; }
  if (!FORCE) {
    const has = await q(`SELECT 1 x FROM \`${TABLE}\` WHERE notice_pk = ? LIMIT 1`, [a.pk]);
    if (has.length) { rejected.push(`${a.pk}: 已有落点(跳过防冗余，需 --force)`); continue; }
  }
  plans.push({ pk: a.pk, code: a.code, level, conf: a.confidence ?? 0.9, reason: String(a.reason ?? "").slice(0, 200), nid: a.notice_id });
}

console.log(`\n=== ${APPLY ? "写入" : "DRY 写计划"}：可写 ${plans.length} / 拒 ${rejected.length} ===`);
for (const p of plans) console.log(`  ✓ pk=${p.pk} → ${p.code} L${p.level} conf=${p.conf.toFixed(2)} | ${p.reason}`);
for (const rj of rejected) console.log(`  ✗ ${rj}`);

if (!APPLY) { console.log(`\n（dry：未写库。确认 R2 已上线后加 --apply --yes）`); await pool.end(); process.exit(0); }

let written = 0;
for (const p of plans) {
  await pool.query(
    `INSERT IGNORE INTO \`${TABLE}\` (notice_pk, node_code, level, confidence, source, model, evidence_text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [p.pk, p.code, p.level, p.conf.toFixed(3), SRC, MODEL, p.reason],
  );
  await pool.query(`UPDATE taxonomy_intake SET status='resolved' WHERE notice_id = ? AND status='pending'`, [p.nid]);
  written++;
}
console.log(`\n✓ 已写 ${written} 条 ai_content 落点 + 翻对应 intake resolved`);
console.log(`下一步：跑 npx tsx scripts/gates/check-commodity-backbone.ts --db 确认 BB15a/b/d 绿；R2 上线后宽表按落点重算列值、门户即时可见。`);
await pool.end();
