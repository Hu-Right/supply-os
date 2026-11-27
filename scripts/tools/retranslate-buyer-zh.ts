/**
 * 小范围重译：把已确认有问题的译名重翻一遍（地址碎片 / 纯职务 / 缩写扩写）
 *
 * 选样（只针对本次新建的 buyer_id > 119622）：
 *   A 原名就是纯职务（COMMANDER / DIRECTOR / HEAD …）
 *   B 原名是地址（含街道词 + 数字）
 *   C 中文名是纯通用部门名（卫生部 / 财政部 / 办公室 …，撞名来源）
 *   D 中文名含括号解释、且括号内容不在原名里（缩写被扩写的特征）
 *
 * 严格 prompt：是地址/岗位就说「未知」、不许扩写未知缩写；「未知」或不合格 → 保留原名不落库。
 * 用法：npx tsx scripts/tools/retranslate-buyer-zh.ts [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { isPureChineseBuyerName, isTooGenericBuyerName } from "../../src/lib/services/buyer/normalize";
import { refreshBuyerProjection } from "../../src/lib/services/buyer/refresh";

const APPLY = process.argv.includes("--apply");
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const KEY = process.env.DEEPSEEK_API_KEY ?? "";
if (!KEY) throw new Error("DEEPSEEK_API_KEY 未配置");

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  charset: "utf8mb4", connectionLimit: 3, enableKeepAlive: true,
});

const ROLE = String.raw`^(COMMANDER|DIRECTOR|HEAD|PRINCIPAL|PROJECT DIRECTOR|OFFICER|CHIEF|MANAGER|SECRETARY|CHAIRMAN|CONTRACTING OFFICER|COMMANDING OFFICER|DEPUTY DIRECTOR|ASSISTANT DIRECTOR|GENERAL MANAGER)$`;
const ADDR = String.raw`(ROAD|STREET|FLOOR|SUITE|PLOT|PO BOX|POST BOX|NO\\.)`;

const [rows] = await pool.query<RowDataPacket[]>(
  `SELECT buyer_id, canonical_name, name_zh, country_code,
          CASE
            WHEN UPPER(TRIM(canonical_name)) REGEXP ? THEN 'role'
            WHEN canonical_name REGEXP ? AND canonical_name REGEXP '[0-9]' THEN 'address'
            WHEN name_zh IN ('卫生部','财政部','教育部','外交部','农业部','交通部','内政部','国防部','司法部','劳工部','文化部','旅游部','办公室','采购处','项目部','秘书处','委员会','管理局','总局') THEN 'generic'
            ELSE 'paren' END AS reason
     FROM buyer
    WHERE buyer_id > 119622 AND status='active'
      AND (UPPER(TRIM(canonical_name)) REGEXP ?
        OR (canonical_name REGEXP ? AND canonical_name REGEXP '[0-9]')
        OR name_zh IN ('卫生部','财政部','教育部','外交部','农业部','交通部','内政部','国防部','司法部','劳工部','文化部','旅游部','办公室','采购处','项目部','秘书处','委员会','管理局','总局')
        OR (name_zh REGEXP '（' AND canonical_name NOT REGEXP '\\\\('))`,
  [ROLE, ADDR, ROLE, ADDR],
);
console.log(`[retrans] 候选 ${rows.length} 条`, JSON.stringify(rows.reduce<Record<string, number>>((a, r) => { a[String(r.reason)] = (a[String(r.reason)] ?? 0) + 1; return a; }, {})));

const PROMPT = `把下列机构名称逐条翻译成简体中文名。严格规则：
- 只输出机构的中文名，不加解释、不加引号；
- 如果名称本质是【地址】（门牌号、街道、楼层、信箱）而不是机构，输出：未知
- 如果名称本质是【职务/岗位】（如 Commander、Director、Head）而不是机构，输出：未知
- 未知缩写保持原样、不要猜测扩写；若有把握就给出通行的中文译名；
- 不要只输出“学校/医院/办公室/部”这类类别词，必须带识别信息；
- 按输入编号输出，每行一条：编号. 中文名`;

async function translate(names: string[]): Promise<string[]> {
  const body = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat", temperature: 0, max_tokens: 1600,
          messages: [{ role: "system", content: PROMPT }, { role: "user", content: body }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
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
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  return names.map(() => "");
}

const BATCH = 10, CONC = 8;
const updates: Array<{ id: number; zh: string; from: string; name: string; reason: string }> = [];
const unknown: Array<{ id: number; name: string; reason: string }> = [];
const rejected: Array<{ name: string; got: string; why: string }> = [];

for (let i = 0; i < rows.length; i += BATCH * CONC) {
  const slice = rows.slice(i, i + BATCH * CONC);
  const groups: Array<RowDataPacket[]> = [];
  for (let j = 0; j < slice.length; j += BATCH) groups.push(slice.slice(j, j + BATCH));
  const results = await Promise.all(groups.map((g) => translate(g.map((r) => String(r.canonical_name)))));
  groups.forEach((g, gi) => {
    g.forEach((r, idx) => {
      const got = (results[gi][idx] ?? "").trim().replace(/\s+/g, "");
      const id = Number(r.buyer_id);
      const name = String(r.canonical_name);
      const reason = String(r.reason);
      if (!got || got === "未知" || got.toUpperCase() === name.toUpperCase()) {
        unknown.push({ id, name: name.slice(0, 50), reason });
      } else if (!isPureChineseBuyerName(got)) {
        rejected.push({ name: name.slice(0, 50), got: got.slice(0, 40), why: "非纯中文" });
      } else if (isTooGenericBuyerName(got) || got.length < 2 || got.length > 120) {
        rejected.push({ name: name.slice(0, 50), got: got.slice(0, 40), why: "过泛/长度" });
      } else {
        updates.push({ id, zh: got, from: String(r.name_zh ?? ""), name: name.slice(0, 50), reason });
      }
    });
  });
  console.log(`[retrans] ${Math.min(i + BATCH * CONC, rows.length)}/${rows.length} ok=${updates.length} 未知=${unknown.length} 拒绝=${rejected.length}`);
}

console.log(`[retrans] 通过 ${updates.length} · 判为地址/职务(不落库) ${unknown.length} · 拒绝 ${rejected.length}`);
for (const u of updates.slice(0, 12)) console.log(`  [${u.reason}] ${u.name} | ${u.from} → ${u.zh}`);
console.log("[retrans] 判为地址/职务的样例：", unknown.slice(0, 6).map((u) => `${u.name}(${u.reason})`).join(" · "));

// 留痕：改前/改后逐条落盘，出问题可回滚
writeFileSync(
  `temp/retrans-buyer-zh-${Date.now()}.json`,
  JSON.stringify({ applied: APPLY, updates, unknown, rejected }, null, 1),
  "utf8",
);


if (!APPLY) {
  console.log("[retrans] DRY：未写库（加 --apply 生效）");
  await pool.end();
  process.exit(0);
}

const conn: PoolConnection = await pool.getConnection();
try {
  for (const u of updates) {
    await conn.query("UPDATE buyer SET name_zh = ?, updated_at = NOW() WHERE buyer_id = ?", [u.zh.slice(0, 500), u.id]);
  }
} finally {
  conn.release();
}
const ids = updates.map((u) => u.id);
if (ids.length > 0) {
  const r = await refreshBuyerProjection(pool, { buyerIds: ids });
  console.log(`[retrans] 投影重建：公告 ${r.rewritten} 条 · 宽表 ${r.wideSynced}`);
}
await pool.end();
