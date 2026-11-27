/**
 * 未匹配买家名 → 中文名（批量回填，产出 TSV，不写库）
 *
 * @module scripts/tools/buyer-zh-backfill
 * @description 从 `notice_public` 里取「没有 buyer_id、名字不含层级分隔符」的原始买家名，
 *              按公告数降序去重，用 DeepSeek 批量翻译成纯中文，逐条过
 *              `isPureChineseBuyerName` / `isTooGenericBuyerName` / 长度闸门，不合格丢弃。
 *
 *              产出 TSV（国家 \t 原名 \t 中文名）交给 `apply-buyer-zh-bulk.ts` 落库；
 *              本脚本只读库、只写 TSV，不产生任何写操作。
 *
 * 用法：
 *   npx tsx scripts/tools/buyer-zh-backfill.ts --limit=8000 --conc=16
 *   npx tsx scripts/tools/buyer-zh-backfill.ts --limit=8000 --conc=16 --out=temp/b1.tsv
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { isPureChineseBuyerName, isTooGenericBuyerName } from "../../src/lib/services/buyer/normalize";

const arg = (k: string, def = ""): string => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").split("=")[1] || def;
const LIMIT = Number(arg("limit", "0"));
const CONC = Number(arg("conc", "16"));
const BATCH = Number(arg("batch", "10"));
const OUT = arg("out", "temp/buyer-zh-backfill.tsv");

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const KEY = process.env.DEEPSEEK_API_KEY ?? "";
if (!KEY) throw new Error("DEEPSEEK_API_KEY 未配置");

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  charset: "utf8mb4", connectionLimit: 2,
});

interface Row extends RowDataPacket { country_code: string; name: string; n: number }

const [rows] = await pool.query<Row[]>(
  `SELECT country_code, TRIM(buyer_name) AS name, COUNT(*) AS n
     FROM notice_public
    WHERE buyer_id IS NULL
      AND buyer_name IS NOT NULL AND buyer_name <> ''
      AND buyer_name NOT LIKE '%>%'
      AND country_code IS NOT NULL AND country_code <> ''
      AND CHAR_LENGTH(buyer_name) BETWEEN 4 AND 300
      AND buyer_name NOT REGEXP '^(https?://|www\\\\.)'
      AND buyer_name NOT REGEXP '^Error[[:space:]]*[0-9]{3}'
      AND buyer_name REGEXP '[[:alpha:]]'
    GROUP BY country_code, name
    ORDER BY n DESC
    ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ""}`,
);
console.log(`[backfill] 候选 ${rows.length} 名 · 覆盖公告 ${rows.reduce((s, r) => s + Number(r.n), 0)} 条 · 并发 ${CONC}x${BATCH}`);

const PROMPT = `把下列机构名称逐条翻译成简洁、正式的简体中文名：
- 有通用中文译名的用通用译名；没有的按读音音译；
- 只输出中文（可含数字与中文标点），绝不能保留任何外文字母或原文缩写；
- 必须保留能区分同类的识别信息（地名、编号、专名），不能只输出“学校/医院/市政机构”这类类别词；
- 不要解释，按输入编号输出，每行一条，格式：编号. 中文名`;

async function translate(names: string[]): Promise<string[]> {
  const body = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat", temperature: 0, max_tokens: 2000,
          messages: [{ role: "system", content: PROMPT }, { role: "user", content: body }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1) + Math.random() * 400));
        continue;
      }
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
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return names.map(() => "");
}

const accepted: Array<{ country: string; name: string; zh: string; n: number }> = [];
const rejected: Array<{ name: string; got: string; why: string }> = [];
const wave = CONC * BATCH;
const startedAt = Date.now();

for (let i = 0; i < rows.length; i += wave) {
  const slice = rows.slice(i, i + wave);
  const groups: Row[][] = [];
  for (let j = 0; j < slice.length; j += BATCH) groups.push(slice.slice(j, j + BATCH));
  const results = await Promise.all(groups.map((g) => translate(g.map((r) => r.name))));
  groups.forEach((g, gi) => {
    g.forEach((r, idx) => {
      const got = (results[gi][idx] ?? "").trim().replace(/\s+/g, "");
      let why = "";
      if (!got) why = "空输出";
      else if (got.toUpperCase() === r.name.toUpperCase()) why = "原样返回";
      else if (!isPureChineseBuyerName(got)) why = "非纯中文";
      else if (isTooGenericBuyerName(got)) why = "过泛";
      else if (got.length < 2 || got.length > 120) why = "长度越界";
      if (why) rejected.push({ name: r.name.slice(0, 60), got, why });
      else accepted.push({ country: String(r.country_code), name: r.name, zh: got, n: Number(r.n) });
    });
  });
  const done = Math.min(i + wave, rows.length);
  const rate = done / Math.max(1, (Date.now() - startedAt) / 1000);
  console.log(`[backfill] ${done}/${rows.length} ok=${accepted.length} reject=${rejected.length} ${rate.toFixed(1)} 名/秒`);
}

writeFileSync(
  OUT,
  accepted.map((a) => `${a.country}\t${a.name.replace(/[\t\r\n]/g, " ")}\t${a.zh}`).join("\n") + "\n",
  "utf8",
);
console.log(`[backfill] 通过 ${accepted.length} · 拒绝 ${rejected.length} · 覆盖公告 ${accepted.reduce((s, a) => s + a.n, 0)} 条`);
console.log("[backfill] 拒绝原因分布：", Object.entries(
  rejected.reduce<Record<string, number>>((acc, r) => { acc[r.why] = (acc[r.why] ?? 0) + 1; return acc; }, {}),
).map(([k, v]) => `${k}:${v}`).join(" · "));
console.log("[backfill] 拒绝样例（前 8）：");
for (const r of rejected.slice(0, 8)) console.log(`  ${r.why} | ${r.name} → ${r.got.slice(0, 40)}`);
console.log(`[backfill] TSV → ${OUT}`);
await pool.end();
