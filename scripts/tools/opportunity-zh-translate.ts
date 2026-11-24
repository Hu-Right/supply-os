/**
 * 商机公告标题机翻任务（独立于同步脚本，只写翻译表）
 *
 * @module scripts/tools/opportunity-zh-translate
 * @description 职责边界（2026-11-24 用户口径）：同步脚本只搬数据，翻译单独跑。
 *              本任务只做一件事：把「服务表可见、且标题没有任何中文」的商机公告标题
 *              用 LLM 翻成简体中文，写进 notice_translations(lang='zh', model='deepseek-chat')。
 *
 *              不写服务表：翻译结果由下一次 opportunity-zh-sync（daily-sync 收尾）搬进
 *              notice_public.title_cn —— 保持「商机/公告 → 翻译表 → 服务表」的单向流。
 *
 * 用法：
 *   npx tsx scripts/tools/opportunity-zh-translate.ts                # DRY：只报待翻条数
 *   npx tsx scripts/tools/opportunity-zh-translate.ts --apply --limit=200
 *   OPPORTUNITY_ZH_MT_LIMIT=0 可整体禁用（同步脚本不读它，这里是唯一消费方）
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(
  (process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]
  || process.env.OPPORTUNITY_ZH_MT_LIMIT
  || 200,
);
const HAN = /[\u4e00-\u9fff]/;
const BATCH = 8;
const CONCURRENCY = 4;
const MODEL = "deepseek-chat";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const KEY = process.env.DEEPSEEK_API_KEY ?? "";
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
if (!KEY) { console.error("DEEPSEEK_API_KEY 未配置，无法机翻"); process.exit(1); }

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 4,
});

/** 机翻产出校验：必须有中文、长度合理、不重复原文中文段 */
function validTitle(cn: string, source: string): boolean {
  if (!cn || !HAN.test(cn)) return false;
  if (cn.length > Math.max(120, source.length * 2)) return false;
  const srcHan = (source.match(/[\u4e00-\u9fff]+/g) || []).join("");
  if (srcHan.length >= 6) {
    const hit = (cn.match(new RegExp(srcHan.slice(0, 6), "g")) || []).length;
    if (hit >= 2) return false;
  }
  return true;
}

async function translateTitles(titles: string[]): Promise<string[] | null> {
  const prompt = `你是政府采购公告的标题译者。把下面 ${titles.length} 个标题逐条译成简体中文标题。
规则：
1. 原样保留编号、参考号、缩写、单位与专有产品名（如 ITB-2024-01、UNOPS、WASH、HVAC）；
2. 译成"标题"而不是句子：不添加原文没有的信息，不写解释、不加"本公告"之类开头；
3. 中文长度控制在原文的 0.6–1.2 倍；超长可压缩修饰语，但不得丢掉采购标的；
4. 原标题里若已含中文段，只保留一份中文，禁止把原中文再拼一遍；
5. 机构名、地名用通行中文译名；
6. 只输出 JSON 数组，元素个数必须等于 ${titles.length}，元素是纯译文。

输入：${JSON.stringify(titles)}

输出（JSON 数组[${titles.length}]）：`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        ...(/deepseek/i.test(MODEL) ? { thinking: { type: "disabled" } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let arr: unknown = null;
    try { arr = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\[[\s\S]*\]/);
      if (m) { try { arr = JSON.parse(m[0]); } catch { /* retry */ } }
    }
    if (Array.isArray(arr) && arr.length === titles.length && arr.every((x) => typeof x === "string")) {
      return (arr as string[]).map((s) => s.trim());
    }
  }
  return null;
}

const t0 = Date.now();

// 目标：服务表可见的商机行，且标题没有任何中文、翻译表里也没有中文标题
const [rows] = await pool.query(
  `SELECT p.notice_pk, p.title AS source_title
     FROM notice_public p
     LEFT JOIN notice_translations t ON t.notice_id = p.notice_pk AND t.lang = 'zh'
    WHERE p.is_opportunity = 1
      AND p.title NOT REGEXP '\\\\p{Han}'
      AND (t.title_tr IS NULL OR t.title_tr NOT REGEXP '\\\\p{Han}')
    ORDER BY p.notice_pk DESC`,
);
const all = rows as Array<{ notice_pk: number; source_title: string }>;
const todo = Number.isFinite(LIMIT) && LIMIT > 0 ? all.slice(0, LIMIT) : [];
console.log(`待机翻 ${all.length} 条；本轮预算 ${todo.length} 条（--limit / OPPORTUNITY_ZH_MT_LIMIT）`);
if (todo.length === 0) { await pool.end(); process.exit(0); }

const done: Array<{ notice_pk: number; title_tr: string }> = [];
let failed = 0;
for (let i = 0; i < todo.length; i += BATCH * CONCURRENCY) {
  const slice = todo.slice(i, i + BATCH * CONCURRENCY);
  const batches: typeof slice[] = [];
  for (let j = 0; j < slice.length; j += BATCH) batches.push(slice.slice(j, j + BATCH));
  const out = await Promise.all(batches.map(async (batch) => {
    try {
      const arr = await translateTitles(batch.map((r) => String(r.source_title || "").slice(0, 400)));
      if (!arr) return batch.map(() => null);
      return arr.map((cn, k) => (validTitle(cn, String(batch[k].source_title || "")) ? cn : null));
    } catch { return batch.map(() => null); }
  }));
  batches.forEach((batch, bi) => {
    batch.forEach((row, k) => {
      const cn = out[bi][k];
      if (cn) done.push({ notice_pk: Number(row.notice_pk), title_tr: cn });
      else failed += 1;
    });
  });
  if ((i / (BATCH * CONCURRENCY)) % 5 === 4) console.error(`  …${Math.min(i + BATCH * CONCURRENCY, todo.length)}/${todo.length}`);
}
console.log(`机翻成功 ${done.length}，校验失败 ${failed}`);

if (APPLY && done.length > 0) {
  for (let i = 0; i < done.length; i += 200) {
    const chunk = done.slice(i, i + 200);
    const sql = `INSERT INTO notice_translations (notice_id, lang, title_tr, model)
                 VALUES ${chunk.map(() => "(?, 'zh', ?, ?)").join(",")}
                 ON DUPLICATE KEY UPDATE
                   title_tr = IF(VALUES(title_tr) IS NULL OR VALUES(title_tr) = '', title_tr, VALUES(title_tr)),
                   model = VALUES(model)`;
    const params = chunk.flatMap((r) => [r.notice_pk, r.title_tr, MODEL]);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try { await pool.query(sql, params); break; }
      catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "ER_LOCK_DEADLOCK" || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
  console.log(`已写翻译表 ${done.length} 条（model=${MODEL}）；服务表由下一次 opportunity-zh-sync 搬运`);
} else {
  console.log("DRY：未写库");
}

console.log(`耗时 ${Date.now() - t0}ms`);
await pool.end();
