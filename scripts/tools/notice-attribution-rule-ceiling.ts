/**
 * 规则层上限预演 —— 打标瀑布第 1 层能白拿多少（只读、不调任何 API、不写库）
 *
 * 回答一个问题：在「无有效落点」的活跃公告里，有多少条**不需要 AI** 就能靠骨架名整串命中
 * 唯一落点？这个数字决定 AI 队列的真实规模，也决定"要不要为 10 万条公告付 LLM 调用费"这件事
 * 值不值——没有它，AI 放量预算就是凭感觉报的。
 *
 * 判据不在此重写：队列选人走 attribution-contract 的 withoutValidLandingWhere / withMinContentWhere
 * 与 utils/notice-expired 的 ACTIVE_NOTICE_WHERE（与 AI 生产者脚本、门禁 Q5 同一条口径）；
 * 匹配与"能不能自动落笔"走 name-matcher（纯函数，可单测）。
 *
 * 两个文本口径分别报数，差距本身就是信息：
 *   A 仅标题（title + 宽表 title_zh）—— 最保守，标题即标的物，命中的东西不可能来自旁句
 *   B 标题 + 正文前 500 字 —— 召回更高，但正文里的旁及名词（"含办公椅采购"的实验室项目）
 *     会造成误命中，所以 B 的增量必须**人工抽检**后才能计入生产队列，不能直接当白拿量
 *
 * 用法：
 *   npx tsx scripts/tools/notice-attribution-rule-ceiling.ts                      # 抽样 30,000 条（默认）
 *   npx tsx scripts/tools/notice-attribution-rule-ceiling.ts --limit=0            # 全量队列（分块拉，慢）
 *   npx tsx scripts/tools/notice-attribution-rule-ceiling.ts --stride=8           # 跳段抽样（每 8 个 id 取 1）
 *   npx tsx scripts/tools/notice-attribution-rule-ceiling.ts --target=coarse      # 只看「只挂 L1 粗码」那批
 *   npx tsx scripts/tools/notice-attribution-rule-ceiling.ts --min-level=4        # 可直落下限改 L4+
 *
 * ⚠ 抽样必须用 --stride，不能只靠 --limit：扫描按 n.id 升序游标，--limit=N 取到的
 *   是最老的 N 干条（采集批次单一，标题形态与词表命中率都不能代表全队列）。
 *
 * @limits 只读。单条语句带 MAX_EXECUTION_TIME；分块游标按 n.id 走主键。
 *         输出文件只落 runtime/（样本 TSV 供人工逐条判读，不做任何自动决策）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  ATTR_LANDING_TABLE,
  ATTR_MIN_CONTENT_CHARS,
  withoutValidLandingWhere,
  withMinContentWhere,
} from "../../src/lib/services/commodity/attribution-contract";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";
import { buildNameIndex, judgeRuleHits, type NameHit } from "../../src/lib/services/commodity/name-matcher";

const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const argNum = (flag: string, d: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? Number(hit.slice(flag.length + 3)) : d;
};
const LIMIT = argNum("limit", 30_000); // 0 = 全量
const MIN_LEVEL = argNum("min-level", 2); // 与 AI 管道 MIN_LEVEL 同一条下限
const CHUNK = argNum("chunk", 2000);
/** 跳段抽样步长：0=不跳段（配合 --limit 就是升序取前 N 条，有年代偏差） */
const STRIDE = argNum("stride", 0);
/** 人群：zero=零落点｜coarse=只挂 L1 粗码｜novalid=两者合计（默认，= 真实待办）｜noai=无 ai_content 行 */
const TARGET = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length) ?? "novalid";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});
/**
 * 只读取数包装：每条 SELECT 挂 MAX_EXECUTION_TIME 提示（与门禁 check-attribution-ssot 同一纪律，
 * 宁可失败也不留长查询在生产上）。本脚本全程只发 SELECT，无写入口。
 */
const q = async <T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]> =>
  ((await conn.query(`/*+ MAX_EXECUTION_TIME(60000) */ ${sql}`, p))[0]) as unknown as T[];

const one = async <T extends Record<string, unknown>>(sql: string): Promise<T> => (await q<T>(sql))[0];

const envRow = await one<{ host: string; db: string }>(`SELECT @@hostname host, DATABASE() db`);
console.log(`目标库：${envRow.host}/${envRow.db}（连接 ${process.env.DB_HOST}:${process.env.DB_PORT}）  只读预演，不写任何表、不调任何 API`);

// ── 队列谓词（口径全部来自契约，本文件不拼新判据）──
const hasAnyLanding = `EXISTS (SELECT 1 FROM \`${ATTR_LANDING_TABLE}\` a WHERE a.notice_pk = n.id)`;
const noAiLanding = `NOT EXISTS (SELECT 1 FROM \`${ATTR_LANDING_TABLE}\` a WHERE a.notice_pk = n.id AND a.source <> 'legacy_tag')`;
const noValid = withoutValidLandingWhere(ATTR_LANDING_TABLE);
const queueWhere =
  TARGET === "zero"
    ? `${ACTIVE_NOTICE_WHERE} AND ${withMinContentWhere("n")} AND NOT ${hasAnyLanding}`
    : TARGET === "coarse"
      ? `${ACTIVE_NOTICE_WHERE} AND ${withMinContentWhere("n")} AND ${hasAnyLanding} AND ${noValid}`
      : TARGET === "noai"
        ? `${ACTIVE_NOTICE_WHERE} AND ${withMinContentWhere("n")} AND ${noAiLanding}`
        : `${ACTIVE_NOTICE_WHERE} AND ${withMinContentWhere("n")} AND ${noValid}`;

const oneNum = async (sql: string): Promise<number> => Number((await one<{ n: number }>(sql)).n ?? 0);

// ── 1. 队列规模 + 正文下限的边界（正文不够的那批只能先重采，不属本档待办）──
const total = await oneNum(`SELECT COUNT(*) n FROM bid_notices n WHERE ${queueWhere}`);
const noContent = await oneNum(
  `SELECT COUNT(*) n FROM bid_notices n WHERE ${ACTIVE_NOTICE_WHERE} AND NOT ${withMinContentWhere("n")} AND ${noValid}`,
);
console.log(`\n队列 target=${TARGET}：可打标 ${total} 条｜同人群但正文不够（<${ATTR_MIN_CONTENT_CHARS} 字，需先重采）${noContent} 条`);

// ── 2. 词表：骨架树自身（ADR-0005 词表 SSOT），一次载全树名 ──
const t0 = Date.now();
const nameRows = await q<{ code: string; nameZh: string; nameEn: string }>(
  `SELECT code, name_zh AS nameZh, name_en AS nameEn FROM commodity_backbone WHERE status=1 ORDER BY code`,
);
const index = buildNameIndex(nameRows);
console.log(`词表：${index.nodes} 节点 → ${index.size} 条整串名（zh+en，已过滤 <${4}/${8} 字符的短名） 建索引 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ── 3. 供应侧锚集（有规则落点却没有供应商接得住 = 单边空转）──
const supRows = await q<{ code: string }>(`SELECT DISTINCT code FROM supplier_backbone_interests`);
const supplierNodes = new Set(supRows.map((r) => r.code));
console.log(`供应侧：${supplierNodes.size} 个品目码有供应商挂着`);

// ── 4. 分块扫描：A 仅标题 / B 标题+正文 ──
type Stat = { none: number; single: number; ambiguous: number; coarse: number };
const mk = (): Stat => ({ none: 0, single: 0, ambiguous: 0, coarse: 0 });
const A = mk();
const B = mk();
const levelA = new Map<number, number>();
const levelB = new Map<number, number>();
const codesA = new Set<string>();
const nodeHits = new Map<string, number>(); // 码 → 命中公告数（看分布是否全挤几个码）
const samples: string[] = ["kind\tnotice_id\ttitle\tcode\tlevel\tevidence\ttitle_zh"];
let scanned = 0;
let lastId = 0;
for (;;) {
  const want = LIMIT > 0 ? Math.min(CHUNK, LIMIT - scanned) : CHUNK;
  if (want <= 0) break;
  const list = await q<{ id: number; notice_id: string; title: string; head: string | null; title_zh: string }>(
    `SELECT n.id, n.notice_id, n.title, LEFT(n.description, 500) head, IFNULL(w.title_zh,'') title_zh
       FROM bid_notices n LEFT JOIN notice_search w ON w.id = n.id
      WHERE n.id > ? AND ${queueWhere}${STRIDE > 1 ? ` AND MOD(n.id, ${STRIDE}) = 1` : ""}
      ORDER BY n.id LIMIT ${want}`,
    [lastId],
  );
  if (list.length === 0) break;
  for (const r of list) {
    scanned++;
    lastId = Number(r.id);
    const titleText = `${String(r.title ?? "")} ${String(r.title_zh ?? "")}`.trim();
    const fullText = `${titleText} ${String(r.head ?? "")}`;
    for (const [stat, text, levels, keep] of [
      [A, titleText, levelA, true] as const,
      [B, fullText, levelB, false] as const,
    ]) {
      const v = judgeRuleHits(index.hitCodes(text), MIN_LEVEL);
      if (v.state === "none") stat.none++;
      else if (v.state === "ambiguous-branch") stat.ambiguous++;
      else if (v.state === "too-coarse") stat.coarse++;
      else {
        stat.single++;
        levels.set(v.level ?? 0, (levels.get(v.level ?? 0) ?? 0) + 1);
        if (keep) {
          codesA.add(v.code ?? "");
          nodeHits.set(v.code ?? "", (nodeHits.get(v.code ?? "") ?? 0) + 1);
          if (samples.length <= 40) {
            samples.push(
              ["single", r.notice_id, JSON.stringify(titleText.slice(0, 60)), v.code, v.level, JSON.stringify(v.hits.map((h: NameHit) => `${h.lang}:${h.name}`).join("|")), JSON.stringify(r.title_zh)].join("\t"),
            );
          }
        }
      }
    }
  }
  process.stdout.write(`\r已扫 ${scanned} 条…`);
}
console.log();

const fmt = (s: Stat, label: string, levels: Map<number, number>) => {
  const pct = (x: number) => `${((x / Math.max(1, scanned)) * 100).toFixed(1)}%`;
  const lv = [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `L${k}=${v}`).join(" ");
  console.log(`${label}：可直落(single) ${s.single} = ${pct(s.single)}｜歧义(多分支) ${s.ambiguous} = ${pct(s.ambiguous)}｜只到 L${MIN_LEVEL} 以下 ${s.coarse}｜无任何整串命中 ${s.none} = ${pct(s.none)}`);
  console.log(`    可直落的层级分布：${lv || "—"}`);
};
console.log(`\n=== 规则层上限（实扫 ${scanned} 条${STRIDE > 1 ? `，跳段 stride=${STRIDE}，占队列 ${((scanned / Math.max(1, total)) * 100).toFixed(1)}%` : ""}，min-level=L${MIN_LEVEL}）===`);
fmt(A, "A 仅标题（保守下界，可直接计入白拿）", levelA);
fmt(B, "B 标题+正文前500（召回上限，增量须人工抽检后才能用）", levelB);

const overlap = [...codesA].filter((c) => supplierNodes.has(c)).length;
console.log(`\nA 口径可直落涉及 ${codesA.size} 个不同节点；其中供应侧有锚的 ${overlap} 个 = ${((overlap / Math.max(1, codesA.size)) * 100).toFixed(1)}%`);
console.log(`    节点集中度（命中公告数 Top8）：${[...nodeHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${c}×${n}`).join(" ")}`);
console.log(`    对照：供应侧现有锚的节点 ${supplierNodes.size} 个（撮合是双方交集，不是公告单边）`);

writeFileSync("runtime/rule-ceiling-sample.tsv", samples.join("\n") + "\n", "utf8");
console.log(`\n✓ 样本（人工逐条判读用，含证据名）→ runtime/rule-ceiling-sample.tsv`);
console.log(`  读法：single 那条若「标题标的 = 命中节点名」则规则可直落；名对而标的不符就是误命中，须把该词从白拿口径里剔出去。`);
console.log(`  报表存档 → runtime/rule-ceiling-${STAMP}.txt 由调用方 tee 保存（本脚本只写样本 TSV）`);
await conn.end();
