/**
 * 买家中文名 LLM 批量补译（DeepSeek）
 *
 * @module scripts/tools/buyer-name-zh-llm
 * @description 处理 buyer.name_zh 为空或混排拉丁字母（如 "Kishoreganj县监狱"）的积压。
 *              按批（8 条/次）调用 DeepSeek，强制输出纯中文；逐条用 isPureChineseBuyerName
 *              校验，不合格的跳过并记入报告——宁缺毋假，不写半成品。
 *
 *              写库只改 name_zh（不动 canonical/alias）；完成后调用 refreshBuyerProjection
 *              让 notice_public.buyer_name_cn 跟上。
 *
 * 用法：
 *   npx tsx scripts/tools/buyer-name-zh-llm.ts --limit=12            # DRY（真调 12 条看质量）
 *   npx tsx scripts/tools/buyer-name-zh-llm.ts --apply               # 全量落库
 *   npx tsx scripts/tools/buyer-name-zh-llm.ts --apply --limit=100
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { isPureChineseBuyerName, isTooGenericBuyerName } from "../../src/lib/services/buyer/normalize";
import {
  buildPublicRow, fetchPublicInputRows, loadPublicBuildContext, upsertPublicRows,
} from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] || 0);
const BATCH = 8;
const CONCURRENCY = 3;

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const KEY = process.env.DEEPSEEK_API_KEY ?? "";
if (!KEY) { console.error("DEEPSEEK_API_KEY 未配置"); process.exit(1); }

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 2,
});

const PROMPT = `把下列机构名称逐条翻译成简洁、正式的简体中文名：
- 有通用中文译名的用通用译名；没有的按读音音译；
- 只输出中文（可含数字与中文标点），绝不能保留拉丁字母或英文缩写；
- 不要添加“公司/机构/部门”之类原文没有的词，不要解释。
按输入编号输出，每行一条，格式：编号. 中文名`;

async function callDeepSeek(names: string[]): Promise<string[]> {
  const body = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0,
          max_tokens: 800,
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: body },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content ?? "";
      const out: string[] = [];
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(\d+)[.、)]\s*(.+?)\s*$/);
        if (!m) continue;
        out[Number(m[1]) - 1] = m[2];
      }
      return names.map((_, i) => out[i] ?? "");
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  return names.map(() => "");
}

(async () => {
  const [allRows] = await pool.query<RowDataPacket[]>(
    "SELECT buyer_id, canonical_name, name_zh FROM buyer WHERE status='active' ORDER BY buyer_id",
  );
  // SQL 只能筛拉丁；西里尔/阿拉伯/混排标点也要走 LLM，故在 JS 用同一准入函数过滤
  const filtered = allRows.filter((r) => !r.name_zh || !isPureChineseBuyerName(r.name_zh));
  const rows = LIMIT > 0 ? filtered.slice(0, LIMIT) : filtered;
  console.log(`[zh-llm] targets=${rows.length}${APPLY ? "" : " (dry)"}`);

  const updates: Array<{ id: number; zh: string; from: string; name: string }> = [];
  const rejected: Array<{ id: number; name: string; got: string; why: string }> = [];

  for (let i = 0; i < rows.length; i += BATCH * CONCURRENCY) {
    const groups: RowDataPacket[][] = [];
    for (let j = i; j < Math.min(i + BATCH * CONCURRENCY, rows.length); j += BATCH) groups.push(rows.slice(j, j + BATCH));
    const results = await Promise.all(groups.map((g) => callDeepSeek(g.map((r) => String(r.canonical_name)))));
    groups.forEach((g, gi) => {
      g.forEach((r, idx) => {
        const got = (results[gi][idx] ?? "").trim();
        const name = String(r.canonical_name);
        let why = "";
        if (!got) why = "空输出";
        else if (got === name) why = "原样返回";
        else if (!isPureChineseBuyerName(got)) why = "非纯中文";
        else if (isTooGenericBuyerName(got)) why = "过泛";
        if (why) rejected.push({ id: Number(r.buyer_id), name, got, why });
        else updates.push({ id: Number(r.buyer_id), zh: got, from: String(r.name_zh ?? ""), name });
      });
    });
    if ((i / (BATCH * CONCURRENCY)) % 5 === 0) console.log(`[zh-llm] ${Math.min(i + BATCH * CONCURRENCY, rows.length)}/${rows.length} ok=${updates.length} reject=${rejected.length}`);
  }

  console.log(`[zh-llm] accepted=${updates.length} rejected=${rejected.length}`);
  console.log("[zh-llm] samples:", updates.slice(0, 8).map((u) => `${u.name} → ${u.zh}`));
  writeFileSync("tmp/buyer-zh-llm-report.json", JSON.stringify({ updates, rejected }, null, 1), "utf8");

  if (!APPLY) { console.log("[zh-llm] DRY，未写库。报告：tmp/buyer-zh-llm-report.json"); await pool.end(); return; }
  for (const u of updates) {
    await pool.query("UPDATE buyer SET name_zh = ? WHERE buyer_id = ? AND status='active'", [u.zh.slice(0, 500), u.id]);
  }
  // 单次装载上下文批量重建：refreshBuyerProjection 每个 chunk 都会重载 11 万买家索引，慢
  const buyerIds = updates.map((u) => u.id);
  const noticeIds: number[] = [];
  for (let i = 0; i < buyerIds.length; i += 500) {
    const chunk = buyerIds.slice(i, i + 500);
    const [nr] = await pool.query<RowDataPacket[]>(
      `SELECT notice_pk FROM notice_public WHERE buyer_id IN (${chunk.map(() => "?").join(",")})`, chunk,
    );
    noticeIds.push(...nr.map((r) => Number(r.notice_pk)));
  }
  const ctx = await loadPublicBuildContext(pool);
  let rebuilt = 0;
  for (let i = 0; i < noticeIds.length; i += 500) {
    const batch = await fetchPublicInputRows(pool, noticeIds.slice(i, i + 500));
    const params: unknown[][] = [];
    for (const row of batch.rows) {
      const p = buildPublicRow(row, ctx, batch);
      if (p) params.push(p);
    }
    rebuilt += await upsertPublicRows(pool, params);
  }
  console.log(`[zh-llm] applied=${updates.length} rebuilt=${rebuilt}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
