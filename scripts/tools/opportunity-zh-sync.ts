/**
 * 商机/公告中文搬运 → 翻译表 → 服务表（daily-sync 收尾步骤，**只搬数据，不做翻译**）
 *
 * @module scripts/tools/opportunity-zh-sync
 * @description 职责边界（2026-11-24 用户口径）：同步脚本只负责数据搬运，翻译属于独立任务
 *              （see scripts/tools/opportunity-zh-translate.ts）。本脚本只做三件事：
 *
 *                ① 商机表的人工中文 → 翻译表
 *                   · title：商机标题里已有的中文段（纯中文/中英混排抽中文段）
 *                   · description：bid_opportunities.description_cn 原文照搬（库内 SQL，数据不出网）
 *                ② 翻译表 → 服务表：回填 notice_public.title_cn / description_cn
 *                ③ 不动任何原文列：notice_public.title/description、商机表 title/description
 *
 *              范围 = 所有「服务表里存在」的商机公告（不只 is_opportunity=1）：
 *              构建端的中文两列只读翻译表，凡是构建会处理到的商机公告都必须先搬进来。
 *              幂等：未变化行不写（正文用差异谓词、标题用 ODKU）。
 *
 * 用法：
 *   npx tsx scripts/tools/opportunity-zh-sync.ts          # DRY：只报数
 *   npx tsx scripts/tools/opportunity-zh-sync.ts --apply
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const HAN = /[\u4e00-\u9fff]/;

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 4,
});

const hanCount = (s: string) => (s.match(/[\u4e00-\u9fff]/g) || []).length;
const hanRatio = (s: string) => hanCount(s) / Math.max(1, s.length);

/**
 * 从商机标题抽中文标题（纯搬运，不生成新文本）。规则：
 *   · 纯中文/大面积中文（≥35%）→ 整条保留，编号（LTA-、第一批：）有意义；
 *   · 否则按 | / - — 空行切段，取含中文且中文占比≥35%的段拼起来；
 *   · 再不行取首尾汉字之间的片段；中文少于 2 字返回 null（留给独立翻译任务）。
 */
function extractZhTitle(raw: unknown): string | null {
  const title = String(raw ?? "").replace(/\*\*/g, "").trim();
  if (!title || !HAN.test(title)) return null;
  if (!/[A-Za-z]/.test(title)) return title;
  if (hanRatio(title) >= 0.35) return title;
  const parts = title
    .split(/\s*[|｜/]\s*|\s+[-–—]\s+|[-–—]{2,}|\s{2,}|\n+/)
    .map((s) => s.replace(/\*\*/g, "").trim())
    .filter(Boolean);
  const cands = parts.filter((p) => HAN.test(p) && hanRatio(p) >= 0.35 && hanCount(p) >= 2);
  if (cands.length > 0) {
    const joined = cands.join("，").replace(/\s+/g, " ").trim();
    if (joined.length >= 2) return joined;
  }
  const first = title.search(/[\u4e00-\u9fff]/);
  const reversed = [...title].reverse().join("");
  const last = title.length - 1 - reversed.search(/[\u4e00-\u9fff]/);
  if (first < 0 || last < first) return null;
  const slice = title.slice(first, last + 1).trim();
  return hanCount(slice) >= 2 && hanRatio(slice) >= 0.3 ? slice : null;
}

async function upsertTitles(rows: Array<{ notice_pk: number; title_tr: string }>): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const sql = `INSERT INTO notice_translations (notice_id, lang, title_tr, model)
                 VALUES ${chunk.map(() => "(?, 'zh', ?, 'human')").join(",")}
                 ON DUPLICATE KEY UPDATE
                   title_tr = IF(VALUES(title_tr) IS NULL OR VALUES(title_tr) = '', title_tr, VALUES(title_tr)),
                   model = IF(model = 'human', 'human', model)`;
    const params = chunk.flatMap((r) => [r.notice_pk, r.title_tr]);
    // 并发写同一唯一键会撞间隙锁（实测 Deadlock），这里串行 + 重试
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try { await pool.query(sql, params); break; }
      catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "ER_LOCK_DEADLOCK" || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
}

const t0 = Date.now();

// ── 1. 商机 → 公告（只拉标题；正文不出客户端）──
// 范围 = 所有「服务表里存在」的商机公告（不只 is_opportunity=1）：
// 构建端的中文正文现在只读翻译表，凡是构建会处理到的商机公告都必须先搬进翻译表，
// 否则那条公告的中文正文会在重建后变空。
const [byConverted] = await pool.query(
  `SELECT o.id AS opp_id, o.title, n.id AS notice_pk
     FROM bid_opportunities o
     JOIN bid_notices n ON n.converted_opp_id = o.id
     JOIN notice_public p ON p.notice_pk = n.id`,
);
const [bySource] = await pool.query(
  `SELECT o.id AS opp_id, o.title, n.id AS notice_pk
     FROM bid_opportunities o
     JOIN bid_notices n ON n.notice_id = o.source_notice_id
     JOIN notice_public p ON p.notice_pk = n.id`,
);
type Mapped = { opp_id: number; title: string; notice_pk: number };
const mapped = new Map<number, Mapped>();
for (const row of [...(bySource as Mapped[]), ...(byConverted as Mapped[])]) {
  const key = Number(row.notice_pk);
  const prev = mapped.get(key);
  if (!prev || String(row.title || "").length > String(prev.title || "").length) mapped.set(key, row);
}
const pks = [...mapped.keys()];
console.log(`商机关联公告 ${pks.length} 条（取数 ${Date.now() - t0}ms）`);

// ── 2. 现有中文标题（只拉短文本）──
const existing = new Map<number, string>();
for (let i = 0; i < pks.length; i += 500) {
  const chunk = pks.slice(i, i + 500);
  const [rows] = await pool.query(
    `SELECT notice_id, title_tr FROM notice_translations
      WHERE lang='zh' AND notice_id IN (${chunk.map(() => "?").join(",")})`,
    chunk,
  );
  for (const r of rows as Array<{ notice_id: number; title_tr: string | null }>) {
    if (r.title_tr && HAN.test(r.title_tr)) existing.set(Number(r.notice_id), r.title_tr);
  }
}

const humanRows: Array<{ notice_pk: number; title_tr: string }> = [];
for (const [pk, row] of mapped) {
  if (existing.has(pk)) continue;
  const zh = extractZhTitle(row.title);
  if (zh) humanRows.push({ notice_pk: pk, title_tr: zh });
}
console.log(`  人工中文标题待写 ${humanRows.length} 条`);

// ── 3. 人工标题写翻译表 ──
if (APPLY && humanRows.length > 0) {
  await upsertTitles(humanRows);
  console.log(`  人工标题已写 ${humanRows.length} 条`);
}

// ── 4. 人工正文：库内搬（只搬缺失/不一致的行）──
// 收敛关键：一个公告可能被多条商机匹配（source_notice_id 一对多），若两条语句都写同一条公告，
// 会因取值不同每轮互相覆盖（实测永远 82/300 行不收敛）。因此：
//   · converted_opp_id 命中的公告只由第一条语句写（一对一，确定）；
//   · source_notice_id 命中的公告只由第二条写，且限定 converted_opp_id IS NULL，并按
//     update_time/id 取唯一一条商机，保证每轮算出的值相同。
if (APPLY) {
  const descSqlConverted = `
    INSERT INTO notice_translations (notice_id, lang, description_tr, model)
    SELECT n.id, 'zh', o.description_cn, 'human'
      FROM bid_opportunities o
      JOIN bid_notices n ON n.converted_opp_id = o.id
      JOIN notice_public p ON p.notice_pk = n.id
      LEFT JOIN notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
     WHERE o.description_cn IS NOT NULL AND o.description_cn <> ''
       AND CHAR_LENGTH(o.description_cn) > 20
       AND (t.notice_id IS NULL OR t.description_tr IS NULL
            OR t.description_tr <> o.description_cn OR t.model <> 'human')
    ON DUPLICATE KEY UPDATE description_tr = VALUES(description_tr), model = 'human'`;
  const descSqlSource = `
    INSERT INTO notice_translations (notice_id, lang, description_tr, model)
    SELECT n.id, 'zh', o.description_cn, 'human'
      FROM bid_notices n
      JOIN notice_public p ON p.notice_pk = n.id
      JOIN bid_opportunities o ON o.id = (
        SELECT o2.id FROM bid_opportunities o2
         WHERE o2.source_notice_id = n.notice_id
           AND o2.description_cn IS NOT NULL AND o2.description_cn <> ''
         ORDER BY o2.update_time DESC, o2.id DESC LIMIT 1)
      LEFT JOIN notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
     WHERE n.converted_opp_id IS NULL
       AND CHAR_LENGTH(o.description_cn) > 20
       AND (t.notice_id IS NULL OR t.description_tr IS NULL
            OR t.description_tr <> o.description_cn OR t.model <> 'human')
    ON DUPLICATE KEY UPDATE description_tr = VALUES(description_tr), model = 'human'`;
  const [r1] = await pool.query(descSqlConverted);
  const [r2] = await pool.query(descSqlSource);
  console.log(`  人工正文搬运：converted ${(r1 as { affectedRows: number }).affectedRows} 行 / source ${(r2 as { affectedRows: number }).affectedRows} 行`);
}

// ── 5. 回填服务表两列中文（原文列不碰）──
if (APPLY) {
  const [res] = await pool.query(`
    UPDATE notice_public p
      JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'zh'
       SET p.title_cn = IF(t.title_tr IS NULL OR t.title_tr = '', p.title_cn, LEFT(t.title_tr, 1000)),
           p.description_cn = IF(t.description_tr IS NULL OR t.description_tr = '', p.description_cn, t.description_tr)
     WHERE p.notice_pk IN (?)
       AND ((t.title_tr IS NOT NULL AND t.title_tr <> ''
             AND (p.title_cn IS NULL OR p.title_cn <> LEFT(t.title_tr, 1000)))
         OR (t.description_tr IS NOT NULL AND t.description_tr <> ''
             AND (p.description_cn IS NULL OR p.description_cn <> t.description_tr)))`, [pks]);
  console.log(`  服务表回填 ${(res as { affectedRows: number }).affectedRows} 行`);
}

// ── 6. 汇总（只统计对外可见的商机行）──
const [[stat]] = await pool.query(`
  SELECT COUNT(*) AS total,
         SUM(title_cn REGEXP '\\\\p{Han}') AS zh_title,
         SUM(description_cn REGEXP '\\\\p{Han}') AS zh_desc
    FROM notice_public WHERE is_opportunity = 1`) as unknown as [[
      { total: number; zh_title: number | null; zh_desc: number | null },
    ]];
console.log(
  `商机行覆盖：${stat.total} 条 | 中文标题 ${stat.zh_title ?? 0}（${(((stat.zh_title ?? 0) / (stat.total || 1)) * 100).toFixed(1)}%）`
  + ` | 中文正文 ${stat.zh_desc ?? 0}（${(((stat.zh_desc ?? 0) / (stat.total || 1)) * 100).toFixed(1)}%）`
  + ` | ${APPLY ? "已写库" : "DRY（未写库）"} | 耗时 ${Date.now() - t0}ms`,
);

await pool.end();
