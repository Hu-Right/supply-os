/**
 * 野码公告「按内容回写 UGT 落点」= R3 写侧生产者（不造码 · 域内骨架枚举 · conf 阈值 · 双闸 · 只锚零落点公告 · 默认 dry）
 *
 * ⚑ AI 触发权归用户（硬约束）：本脚本只在【你手动运行】时才调用付费 API；--scope 模式不调任何 API、只报体量。
 *   无任何自动/定时 AI 调用。放量 apply 前先用 --scope 看量、再 --dry 看落点质量，每一步都由你拍板。
 *
 * 做什么：把 taxonomy_intake 里 pending 的野码公告，按【公告正文语义】靠拢到
 *         commodity_backbone 上【已存在】的节点，落点写 notice_attribution_nodes
 *         （source='ai_content'），并把该公告在 intake 里的 pending 行翻成 resolved。
 *
 * 铁律（探针 197~203 实测 + 用户约束定稿）：
 *   1) 禁造码：AI 只能从候选（域内 L2+L3 骨架枚举 ∪ 域内 L4/L5 召回 ∪ 全局兜底）里选，绝不提新码；
 *   2) 容纳优先于相近（2026-10-15 用户定稿「宁上勿偏」）：叶子与标的物完全对应才选叶子，
 *      对应不上必须上挂父类，禁止选语义相近但指代不同的近邻叶子；下限 L2（挂不到 = 未命中）；
 *   3) 双闸落笔：形制 assertAttributionNode + 树内码 loadBackboneIndex().nodeOf（镜像 backfill 无幻觉）；
 *   4) 精度靠置信度：只有 conf ≥ MIN_CONF（默认 0.7）才落笔；低置信留 pending 交人工，不硬挂。
 *   5) 只锚「无**有效**落点」的公告（2026-10-19 修口径）：判据 = 落点表里没有一条 L2+ 码。
 *      旧写法把「有任意落点行」当作已归属，于是 14.3 万条只挂到 L1 大类的公告（宽表 backbone_path 里
 *      就是一串大类码，品目撮合/行业墙/定向邀请都吃不到）被永久跳过，同时又被覆盖率算成已覆盖。
 *      这批走 --target=coarse：锚定成功后在同一事务删掉它自己的 legacy_tag 粗码行（不删就破 AS1 混源
 *      与 BB15b 父子冗余），且只删 legacy_tag —— 非 legacy 的粗码行是不可重算的判定事实，撞上直接报错
 *      交人工（与 assertDroppable 同纪律）。已有有效落点的公告仍不重复挂（原纪律不变）。
 *   6) 精化复问（zoom-in，2026-10-19 改写）：非 L5 落点**逐层**列出直接子节点复问，不再一次跨两层。
 *      依据：实测「下两层后代数」最大 1,351（UGT-2201xx 一整片、6,678 个父类里 120 个超 120），
 *      旧的 ORDER BY rel LIMIT 120 会把超出部分截掉 ⇒「精确叶子只要存在必在清单」的构造保证不成立，
 *      这正是 AI 落点只有 19.5% 到叶子层的直接原因。改为每跳只列一层直接子节点（实测上限 99），
 *      全量枚举不截断 ⇒ 构造保证回到构造本身；超限硬闸（MAX_CHILDREN）宁可维持父类并计数报警，
 *      也不静默截断。代价：单条公告 ≈2~4 次 LLM 调用（stage1 定域 + stage2 选点 + 最多 2 跳精化）。
 *
 * ⚠ 生效链路（2026-10-19 核正：旧注释说「需 R2 切读才能生效」已过期）：
 *   本脚本只写事实源落点表；宽表 backbone_path 由 loadBackboneMap 从同一张表换算，
 *   而落点行已进指纹段 ITEM_SEG（小表剥离 2026-10-14 完成）⇒ 写完指纹自然不等，
 *   下一轮对账/同步重建宽行与索引。无旁路写宽表，单一写入者纪律不变。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --scope                  # 【不调 API】只报待处理体量与估算调用数
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts                         # 全量 dry（不写库，但会调 LLM 出写计划）
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --limit-batches 2       # 先小批 dry 看闸口与命中
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --apply --yes           # 人工放行后真写
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --apply --yes --resume  # 断点续跑
 *   # 历史粗落点（只挂 L1 大类）重推：锚定成功后同事务删该公告的 legacy_tag 粗码行
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --scope --target=coarse  # 不调API：报「粗落点待重推」体量
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --target=coarse --apply --yes
 *   # 全量按内容重推（摘除旧品类字典码路线）：--target 选人群，--replace-legacy 覆盖并删除 legacy_tag
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --scope --target=classified   # 不调API：报「已归类待重推」体量
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --scope --target=all          # 不调API：报「全量内容集」体量
 *   npx tsx scripts/tools/notice-attribution-content-ai.ts --target=all --replace-legacy --apply --yes   # 须先 --scope/--dry 审
 * 环境变量：MIN_CONF=0.7 MIN_LEVEL=2 BATCH=40 CONC=6（LLM 并发）TOPK=60 DESC_CAP=500 MAX_ZOOM_HOPS=2
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { loadBackboneIndex, backboneNodeLevel } from "../../src/lib/services/commodity/backbone-path";
import { assertAttributionNode } from "../../src/lib/services/commodity/attribution";
import {
  ATTR_SOURCE_LEGACY,
  ATTR_VALID_MIN_CODE_LEN,
  withoutValidLandingWhere,
  withMinContentWhere,
} from "../../src/lib/services/commodity/attribution-contract";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";

const APPLY = process.argv.includes("--apply");
const YES = process.argv.includes("--yes");
const RESUME = process.argv.includes("--resume");
const SCOPE = process.argv.includes("--scope");
const TARGET = (() => { const eq = process.argv.find((x) => x.startsWith("--target=")); if (eq) return eq.slice("--target=".length); const i = process.argv.indexOf("--target"); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : "pending"; })(); // pending | coarse | classified | all
const REPLACE_LEGACY = process.argv.includes("--replace-legacy");
const argNum = (flag: string, d: number) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
const LIMIT_BATCHES = argNum("--limit-batches", Infinity);
const MIN_CONF = Number(process.env.MIN_CONF || 0.7);
const MIN_LEVEL = Number(process.env.MIN_LEVEL || 2);
const BATCH = Number(process.env.BATCH || 40);
const CONC = Number(process.env.CONC || 6);
const TOPK = Number(process.env.TOPK || 60);
const DESC_CAP = Number(process.env.DESC_CAP || 500);
const MODEL = process.env.PROBE_LLM_MODEL || "deepseek-flash";
const CONSENSUS = process.argv.includes("--consensus");
/**
 * 精化下钻最多跳数：从当前落点逐层往下问，每跳只列一层直接子节点。
 * 默认 2：从 L3 起可走到 L5（叶子），从 L2 起走到 L4 就停 —— 再深收益递减而每条多一次调用。
 */
const MAX_ZOOM_HOPS = Number(process.env.MAX_ZOOM_HOPS || 2);
/**
 * 单层直接子节点的硬闸：实测全树上限 99，这里留 3 倍余量。
 * 超闸宁可不下钻（维持已选父类）并计数报警，绝不静默截断——静默截断就是本次修的破口本身。
 */
const MAX_CHILDREN = Number(process.env.MAX_CHILDREN || 300);
/** 全进程 LLM 用量（计费口径）：所有 chat() 调用的 token 累计，收尾打印 */
const USAGE = { calls: 0, prompt: 0, completion: 0 };
/** 精化阶段被硬闸拦下的次数（树长大了超过 MAX_CHILDREN 时会非 0，必须报数不能静默） */
const ZOOM = { capped: 0, hops: 0 };
const SRC = "ai_content";
const TABLE = "notice_attribution_nodes";
const STATE = "runtime/notice-attribution-content-ai-state.json";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

if (APPLY && !YES) { console.error("✗ --apply 必须显式带 --yes（人工闸口）；先跑 --dry 出报表，审完再上"); process.exit(1); }
if (!["pending", "coarse", "classified", "all"].includes(TARGET)) { console.error(`✗ 未知 --target=${TARGET}（可选 pending|coarse|classified|all）`); process.exit(1); }
if (APPLY && (TARGET === "classified" || TARGET === "all") && !REPLACE_LEGACY) { console.error("✗ --target=classified/all 必须带 --replace-legacy：成功按内容锚定后删除该公告 legacy_tag（含有效深码），否则父子冗余破 BB15b"); process.exit(1); }
if (TARGET === "coarse" && REPLACE_LEGACY) { console.error("✗ --target=coarse 不接受 --replace-legacy：本人群的定义就是「只有粗落点」，写入时同事务只删自己的 legacy_tag 粗码行；把开关拉回全量替换就绕过了“只删粗行”这条约束"); process.exit(1); }
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, ""); }
const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!SCOPE && !apiKey) { console.error("✗ 需 DEEPSEEK_API_KEY（非 --scope 模式要真跑判定；--scope 只报体量不需 key）"); process.exit(1); }

const pool = await mysql.createPool({ host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", connectionLimit: CONC + 2 });
const q = async <T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]> => (await pool.query(sql, p))[0] as unknown as T[];

/**
 * target → 选人群 WHERE 片段（四个人群都要同时过三道闸：活跃 + 正文够 + 无有效落点）。
 *   pending    = intake 队列里待定的野码公告（生产者在 src/lib/services/commodity/taxonomy-intake.ts）
 *   coarse     = 有落点行但全为粗码（<L2，即只挂到 L1 大类）——14.3 万条存量就在这里
 *   classified = 已有 legacy_tag 深码、要按内容重推并替换（需 --replace-legacy，那是翻案）
 *   all        = 全量有正文且无 ai_content 行（专项重推，必须 --replace-legacy）
 * 为何每档都上「活跃」闸：旧写法不看活跃，--target=pending 报出 39,445 条待办而其中真活跃
 * 只有 7 条（2026-10-19 实测）——那个体量完全是假的，按它报价就是为过期公告烧 AI 钱。
 * 下限不在此重写：无有效落点走 withoutValidLandingWhere、正文下限走 withMinContentWhere，
 * 两者与 intake 生产者、门禁 Q5 同一份实现。
 */
function targetCond(): string {
  const active = ACTIVE_NOTICE_WHERE;
  const content = withMinContentWhere("n");
  const noValidLanding = withoutValidLandingWhere(TABLE);
  const hasAnyLanding = `EXISTS (SELECT 1 FROM ${TABLE} a WHERE a.notice_pk = n.id)`;
  const hasLegacy = `EXISTS (SELECT 1 FROM ${TABLE} a WHERE a.notice_pk = n.id AND a.source = '${ATTR_SOURCE_LEGACY}')`;
  const noAiLanding = `NOT EXISTS (SELECT 1 FROM ${TABLE} a WHERE a.notice_pk = n.id AND a.source = '${SRC}')`;
  if (TARGET === "coarse") return `${active} AND ${content} AND ${hasAnyLanding} AND ${noValidLanding}`;
  if (TARGET === "classified") return `${active} AND ${content} AND ${hasLegacy} AND ${noAiLanding}`;
  if (TARGET === "all") return `${active} AND n.title IS NOT NULL AND n.title <> '' AND ${content} AND ${noAiLanding}`;
  return `${active} AND ${content} AND EXISTS (SELECT 1 FROM taxonomy_intake i WHERE i.notice_id = n.notice_id AND i.status = 'pending') AND ${noValidLanding}`;
}

/** 人群文字（--scope 报告用） */
const TARGET_LABEL: Record<string, string> = {
  pending: "intake 待定野码（活跃且正文够）",
  coarse: "只有 L1 粗落点、等于没归属（活跃且正文够）",
  classified: "已 legacy_tag 归类、待按内容重推替换 legacy",
  all: "全量有正文、无 ai_content 落点",
};

// ── 目标库自证 ──
const [env] = await q<{ host: string; db: string }>(`SELECT @@hostname host, DATABASE() db`);
console.log(`目标库：${env.host}/${env.db}（连接 ${process.env.DB_HOST}:${process.env.DB_PORT}）  模式=${APPLY ? "★APPLY(写库)" : "dry(不写)"}${CONSENSUS ? " ★双跑共识" : ""}  conf≥${MIN_CONF} 级≥L${MIN_LEVEL} 批=${BATCH} 并发=${CONC}`);
if (!APPLY) console.log("  （dry：会真调 LLM 与召回，但【不写任何表】，出写计划供审核）");

// ── --scope：只报体量，不调用任何 API（AI 花费由用户显式决定）──
if (SCOPE) {
  const c = await q<{ n: number }>(
    `SELECT COUNT(*) n FROM bid_notices n
      WHERE ${targetCond()}`,
  );
  const todo = Number(c[0].n);
  console.log(`\n【--scope 体量预估·不调用任何 API】target=${TARGET}`);
  console.log(`待处理公告 = ${todo}（${TARGET_LABEL[TARGET]}）`);
  // 同一句里附「本档之外还有多少同类公告卡在采集环节」：活跃闸与正文闸已入 SQL，
  // 所以这里的差值 = 同人群但正文不够者——它们只能先重采，给 AI 钱也推不动。
  const noContent = await q<{ n: number }>(
    `SELECT COUNT(*) n FROM bid_notices n
      WHERE ${ACTIVE_NOTICE_WHERE} AND NOT ${withMinContentWhere("n")} AND ${
        TARGET === "coarse" ? `EXISTS (SELECT 1 FROM ${TABLE} a WHERE a.notice_pk = n.id) AND ${withoutValidLandingWhere(TABLE)}` : withoutValidLandingWhere(TABLE)
      }`,
  );
  console.log(`同人群但正文不够（需先重采，不属本档待办）= ${Number(noContent[0]?.n ?? 0)}`);
  console.log(`估算 API 调用 ≈ ${todo} × ${CONSENSUS ? "4~8（双跑共识：2 轮×每轮最多 4 次）" : `2~4（stage1 定域 + stage2 选点 + 非叶子落点最多 ${MAX_ZOOM_HOPS} 跳逐层精化）`} + 译名批(50 条/次) ≈ ${Math.round(todo * (CONSENSUS ? 6 : 3))}+ 次；实际写入受 conf≥${MIN_CONF} 约束会更少`);
  console.log(`⚠ 用不用 AI、何时跑由你决定：确认可接受后再跑 dry/apply。`);
  await pool.end();
  process.exit(0);
}

const ancestorCodes = (code: string) => { const b = code.slice(4); const o: string[] = []; for (let l = 2; l <= b.length; l += 2) o.push("UGT-" + b.slice(0, l)); return o; };
async function chat(prompt: string, ms = 30_000): Promise<string> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${String(apiKey)}` }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], stream: false, temperature: 0.1, thinking: { type: "disabled" } }) });
    if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    USAGE.calls++; USAGE.prompt += Number(data?.usage?.prompt_tokens ?? 0); USAGE.completion += Number(data?.usage?.completion_tokens ?? 0);
    return String(data?.choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  } finally { clearTimeout(t); }
}
const extractJson = (raw: string): unknown | null => { const m = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
async function translateZh(titles: string[]): Promise<string[]> {
  const out: string[] = new Array(titles.length);
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const p = `Translate each procurement notice title to concise Chinese. Output ONLY a JSON array of ${chunk.length} strings, same order, no explanation.\nInput: ${JSON.stringify(chunk)}\nOutput(JSON array[${chunk.length}]):`;
    try { const a = extractJson(await chat(p, 60_000)); if (Array.isArray(a) && a.length === chunk.length) chunk.forEach((_, j) => (out[i + j] = String(a[j] ?? "").trim())); else chunk.forEach((_, j) => (out[i + j] = titles[i + j])); }
    catch { chunk.forEach((_, j) => (out[i + j] = titles[i + j])); }
  }
  return out;
}
async function runPool<T, R>(items: T[], limit: number, fn: (it: T, i: number) => Promise<R>): Promise<R[]> {
  const res = new Array<R>(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const idx = i++; res[idx] = await fn(items[idx], idx); } }));
  return res;
}

// 骨架索引（树内码闸口）+ L1 大类清单（stage1 闭集）
const idx = await loadBackboneIndex(<T>(sql: string) => q<T>(sql));
const l1rows = await q<{ code: string; name_zh: string; name_en: string }>(`SELECT code, name_zh, name_en FROM commodity_backbone WHERE level=1 AND status=1 ORDER BY code`);
const l1set = new Set(l1rows.map((r) => r.code));
const l1List = l1rows.map((r) => `${r.code} ${r.name_zh}${r.name_en ? " / " + r.name_en : ""}`).join("\n");
console.log(`骨架索引 ${idx.size} 节点，L1 大类 ${l1rows.length} 个\n`);

type Plan = { pk: number; notice_id: string; code: string; level: number; conf: number; reason: string; verdict: string };
type State = { lastId: number; scanned: number; anchored: number; lowConf: number; none: number; rejected: number; written: number; coarseDeleted: number; legacyDeleted: number; samples: Plan[]; done: boolean };
const fresh = (): State => ({ lastId: 0, scanned: 0, anchored: 0, lowConf: 0, none: 0, rejected: 0, written: 0, coarseDeleted: 0, legacyDeleted: 0, samples: [], done: false });
const st: State = RESUME && existsSync(STATE) ? { ...fresh(), ...JSON.parse(readFileSync(STATE, "utf8")) } : fresh();

/** 单条公告：域内骨架枚举召回 + LLM 选最深且正确 → 双闸 + conf/level 判可落 */
async function anchorOne(n: { pk: number; notice_id: string; title: string; desc: string; zh: string }): Promise<Plan> {
  const plan: Plan = { pk: n.pk, notice_id: n.notice_id, code: "", level: 0, conf: 0, reason: "", verdict: "" };
  // stage1 定域
  const s1 = `以下是采购公告，请从给定的 ${l1rows.length} 个大类里选出它所属的最多 2 个大类编号（只能选列表里的编号）。只输出 JSON 数组，如 ["UGT-01","UGT-04"]，无合适则 []。\n\n大类列表：\n${l1List}\n\n公告标题：${n.title}\n${n.zh ? `标题中文：${n.zh}\n` : ""}公告正文（截断）：${n.desc.slice(0, DESC_CAP)}\n\n输出(JSON array):`;
  let groups: string[] = [];
  try { const p = extractJson(await chat(s1)); if (Array.isArray(p)) groups = p.map((x) => String(x).trim()).filter((x) => /^UGT-\d{2}$/.test(x) && l1set.has(x)).slice(0, 2); } catch { /* 无域 */ }
  // stage2 候选：域内 L2+L3 枚举 ∪ 域内 L4/L5 召回 ∪ 全局兜底
  const cand = new Map<string, number>();
  const add = (code: string, w: number) => cand.set(code, Math.max(cand.get(code) ?? 0, w));
  const likeSql = groups.map(() => "code LIKE ?").join(" OR ");
  if (groups.length) {
    const gp = groups.map((g) => g + "%");
    for (const r of await q<{ code: string }>(`SELECT code FROM commodity_backbone WHERE status=1 AND level IN (2,3) AND (${likeSql})`, gp)) add(r.code, 3);
    for (const query of [n.zh, n.title].filter(Boolean)) {
      const deep = await q<{ code: string; rel: number }>(`SELECT code, MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) rel FROM commodity_backbone WHERE status=1 AND level IN (4,5) AND (${likeSql}) AND MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) ORDER BY rel DESC LIMIT ?`, [query, ...gp, query, TOPK]);
      for (const r of deep) add(r.code, 2 + Number(r.rel) / 1000);
    }
  }
  for (const query of [n.zh, n.title].filter(Boolean)) {
    const g = await q<{ code: string; rel: number }>(`SELECT code, MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) rel FROM commodity_backbone WHERE status=1 AND MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) ORDER BY rel DESC, level DESC LIMIT ?`, [query, query, TOPK]);
    for (const r of g) add(r.code, 1 + Number(r.rel) / 1000);
  }
  if (cand.size === 0) { plan.verdict = "no-candidate"; return plan; }
  const sel = new Map(cand);
  for (const [code, w] of cand) for (const a of ancestorCodes(code)) if (!sel.has(a)) sel.set(a, w - 1);
  const codes = [...sel.keys()];
  const meta = new Map((await q<{ code: string; name_zh: string; level: number }>(`SELECT code, name_zh, level FROM commodity_backbone WHERE code IN (${codes.map(() => "?").join(",")}) AND status=1`, codes)).map((r) => [r.code, { name: r.name_zh, level: r.level }]));
  const list = codes.filter((x) => meta.has(x)).sort((a, b) => (sel.get(b)! - sel.get(a)!) || (meta.get(b)!.level - meta.get(a)!.level)).slice(0, 160).map((code) => ({ code, path: ancestorCodes(code).map((a) => meta.get(a)?.name ?? "?").join(">") }));
  const s2 = `你是政府采购品目归类器。给你一条公告和一组【已存在的】候选品目节点（编号 | 层级路径 大类>中类>小类>子类>品目）。任务：选出公告所属的节点编号——判定标准是【容纳】，不是【相近】。规则：只能选候选里的编号，【禁止提新码/新类目】；候选里的叶子品目与公告标的物【完全对应】时才选叶子（越深越好）；叶子对应不上、但其父类(L4/L3/L2)能容纳时，【必须上挂父类】——语义相近但指代不同标的物的近邻叶子视为不贴切，宁上挂父类也不选它；【不得选 L1 大类】；候选里任何层级都不沾边才输出 NONE。confidence 只反映【容纳准确度】：上挂父类是正确行为，照常给高 confidence；只有选中「相近但不对应」的节点时才给低 confidence。只输出一个 JSON 对象，无解释无 markdown：{"code":"...","confidence":0.0到1.0,"reason":"一句话依据"}\n\n公告标题：${n.title}\n${n.zh ? `标题中文：${n.zh}\n` : ""}公告正文（截断）：${n.desc.slice(0, DESC_CAP)}\n\n候选：\n${list.map((x, k) => `[${k + 1}] ${x.code} | ${x.path}`).join("\n")}\n\n输出(JSON):`;
  let pick = { code: "NONE", confidence: 0, reason: "bad-json" };
  try { const o = extractJson(await chat(s2)); if (o && typeof o === "object" && !Array.isArray(o)) { const r = o as Record<string, unknown>; pick = { code: String(r.code ?? "NONE").trim(), confidence: Number(r.confidence) || 0, reason: String(r.reason ?? "").slice(0, 160) }; } } catch { plan.verdict = "llm-error"; return plan; }
  plan.code = pick.code; plan.conf = pick.confidence; plan.reason = pick.reason;
  if (pick.code === "NONE") { plan.verdict = "none"; return plan; }
  // 双闸：形制 + 树内码
  let code = ""; try { code = assertAttributionNode(pick.code, n.pk); } catch { plan.verdict = "bad-shape"; return plan; }
  if (!idx.nodeOf(code)) { plan.verdict = "phantom"; return plan; }
  const lv = backboneNodeLevel(code);
  if (lv < MIN_LEVEL) { plan.level = lv; plan.verdict = "too-coarse"; return plan; }
  plan.level = lv;
  // stage3 精化（zoom-in，2026-10-19 改写为「逐层下钻」）：
  // 旧写法一次列「下两层全部后代」并 ORDER BY rel LIMIT 120。实测该清单最大 1,351 项
  // （UGT-2201xx 一整片，6,678 个父类里 120 个超 120），超出部分被截 ⇒ 那句「精确叶子只要存在
  // 就必然在清单里」的构造保证并不成立；这就是 ai_content 落点只有 19.5% 到叶子层的直接原因。
  // 现在每跳只列【一层的直接子节点】并全量枚举（实测全树上限 99 ≪ MAX_CHILDREN），
  // 构造保证回到构造本身：精确叶子存在 ⇒ 一定在清单里。超硬闸则不下钻、维持父类并计数，
  // 绝不静默截断（那等于把刚修的破口重新挖开，只是注释里没人再写）。
  let cur = code;
  let curLv = lv;
  let curName = meta.get(code)?.name ?? "";
  for (let hop = 0; hop < MAX_ZOOM_HOPS && curLv < 5; hop++) {
    const kids = await q<{ code: string; name_zh: string; level: number }>(
      `SELECT code, name_zh, level FROM commodity_backbone
        WHERE status=1 AND level = ? AND code LIKE ? ORDER BY code`,
      [curLv + 1, `${cur}%`],
    );
    if (kids.length === 0) break; // 本层无子节点：已是可达最深，维持
    if (kids.length > MAX_CHILDREN) { ZOOM.capped++; break; } // 超闸：不下钻，宁可维持父类并报数
    ZOOM.hops++;
    const s3 = `你是政府采购品目归类器的精化器。公告此前被归入父类 ${cur}（${curName}）。下面是它**更深一层的直接子节点**（编号|层级|名称），全量列出未截断。任务：其中若有与公告标的物【完全对应】的更深节点，必须选它（精确优先于上挂）；若【没有任何一个】完全对应，则维持父类 ${cur} 不变——宁上勿偏，禁止选相近但不完全对应的节点。code 只能是 ${cur} 本身或列表中的编号。只输出一个 JSON 对象，无解释无 markdown：{"code":"...","confidence":0.0到1.0,"reason":"一句话依据"}\n\n公告标题：${n.title}\n${n.zh ? `标题中文：${n.zh}\n` : ""}公告正文（截断）：${n.desc.slice(0, DESC_CAP)}\n\n子节点：\n${kids.map((x) => `${x.code} | L${x.level} | ${x.name_zh}`).join("\n")}\n\n输出(JSON):`;
    let moved = false;
    try {
      const o3 = extractJson(await chat(s3));
      if (o3 && typeof o3 === "object" && !Array.isArray(o3)) {
        const r3 = o3 as Record<string, unknown>;
        const c3 = String(r3.code ?? "").trim();
        const conf3 = Number(r3.confidence) || 0;
        if (c3 === cur) {
          plan.conf = conf3 || plan.conf; // 复核维持本层：采纳复问后的置信度，停止下钻
        } else {
          const kid = kids.find((k) => k.code === c3);
          if (kid) {
            const code3 = assertAttributionNode(c3, n.pk); // 形制闸（清单本身保证树内，双闸口径不省）
            const lv3 = backboneNodeLevel(code3);
            if (lv3 > curLv && lv3 >= MIN_LEVEL && idx.nodeOf(code3)) {
              plan.code = code3; plan.level = lv3; plan.conf = conf3 || plan.conf;
              plan.reason = String(r3.reason ?? "").slice(0, 160);
              cur = code3; curLv = lv3; curName = kid.name_zh; moved = true;
            }
          }
        }
      }
    } catch { /* 精化失败（LLM 错/脏 JSON/形制非法）维持既有判定 */ }
    if (!moved) break;
  }
  plan.verdict = plan.conf >= MIN_CONF ? "anchor" : "low-conf";
  return plan;
}

/** 双跑共识合并（--consensus）：码一致→精准挂；同子树（前缀包含）→取浅者=自动挂父类；
 *  跨族→偶位对齐公共前缀祖先（低于下限留人工）；任一轮无有效判定→留人工。置信度取两轮较小值。 */
function mergeConsensus(p1: Plan, p2: Plan): Plan {
  const ok = (p: Plan) => (p.verdict === "anchor" || p.verdict === "low-conf") && Boolean(p.code) && p.code !== "NONE";
  if (!ok(p1) || !ok(p2)) {
    const base = ok(p1) ? p1 : p2;
    return { ...base, conf: 0, reason: `共识不一致（${p1.verdict}/${p1.code || "无"} vs ${p2.verdict}/${p2.code || "无"}）`, verdict: "low-conf" };
  }
  const conf = Math.min(p1.conf, p2.conf);
  const pass = conf >= MIN_CONF ? "anchor" : "low-conf";
  if (p1.code === p2.code) return { ...p1, conf, reason: `共识同码: ${p1.reason}`.slice(0, 160), verdict: pass };
  const [shallow, deep] = p1.code.length <= p2.code.length ? [p1, p2] : [p2, p1];
  if (deep.code.startsWith(shallow.code)) return { ...shallow, conf, reason: `共识取父（${shallow.code} ⊂ ${deep.code}）`, verdict: pass };
  const a = p1.code.slice(4), b = p2.code.slice(4);
  let l = 0;
  while (l + 2 <= Math.min(a.length, b.length) && a.slice(0, l + 2) === b.slice(0, l + 2)) l += 2;
  const lca = l > 0 ? "UGT-" + a.slice(0, l) : "";
  const lv = lca ? backboneNodeLevel(lca) : 0;
  if (lv >= MIN_LEVEL && idx.nodeOf(lca)) return { ...p1, code: lca, level: lv, conf, reason: `跨族共识取公共祖先（${p1.code} vs ${p2.code} → ${lca}）`, verdict: pass };
  return { ...p1, code: lca, level: lv, reason: `共识失败（${p1.code} vs ${p2.code}，公共祖先${lca ? ` ${lca} L${lv}` : "无"}低于下限）`, verdict: "low-conf" };
}

let batchNo = 0;
for (;;) {
  if (batchNo >= LIMIT_BATCHES) { console.log(`⚠ 到 --limit-batches ${LIMIT_BATCHES} 上限，停在游标 ${st.lastId}`); break; }
  const rows = await q<{ pk: number; notice_id: string; title: string; description: string; coarse_rows: number }>(
    `SELECT n.id pk, n.notice_id, n.title, n.description,
       (SELECT COUNT(*) FROM ${TABLE} a WHERE a.notice_pk = n.id AND LENGTH(a.node_code) < ${ATTR_VALID_MIN_CODE_LEN}) coarse_rows
      FROM bid_notices n
      WHERE n.id > ? AND ${targetCond()}
      ORDER BY n.id LIMIT ${BATCH}`, [st.lastId],
  );
  if (rows.length === 0) break;
  const zh = await translateZh(rows.map((r) => String(r.title ?? "")));
  const items = rows.map((r, i) => ({ pk: Number(r.pk), notice_id: String(r.notice_id), title: String(r.title ?? ""), desc: String(r.description ?? ""), zh: zh[i] ?? "" }));
  // pk → 该公告现有粗落点行数；写入侧据此决定要不要同批清理（不查库重进一次循环）
  const coarseByPk = new Map<number, number>(rows.map((r) => [Number(r.pk), Number(r.coarse_rows ?? 0)]));
  st.lastId = Math.max(st.lastId, ...items.map((x) => x.pk));
  // 双跑共识（--consensus）：同一公告的两个独立判定并行发出，再机械合并——
  // 一致→互相印证精准挂；同子树摇摆→取父（宁上勿偏）；跨族→公共祖先或留人工。
  const plans = CONSENSUS
    ? await runPool(items, CONC, async (it) => { const [a, b] = await Promise.all([anchorOne(it), anchorOne(it)]); return mergeConsensus(a, b); })
    : await runPool(items, CONC, anchorOne);
  st.scanned += items.length;

  const ok = plans.filter((p) => p.verdict === "anchor");
  for (const p of plans) { if (p.verdict === "anchor") st.anchored++; else if (p.verdict === "low-conf") st.lowConf++; else if (p.verdict === "none" || p.verdict === "no-candidate") st.none++; else st.rejected++; if (st.samples.length < 30 && p.code) st.samples.push(p); }

  if (APPLY && ok.length) {
    // 一公告一事务：插新行、翻 intake 状态、删旧行必须在同一事务内——分开发写就是
    // 「legacy 已删而新行未入」的空归属窗口（AS4 断供形态），门禁红一条都拦不住它。
    const conn = await pool.getConnection();
    try {
      for (const p of ok) {
        const coarse = coarseByPk.get(p.pk) ?? 0;
        await conn.beginTransaction();
        try {
          // --replace-legacy（classified/all 翻案专用）：先删该公告的 legacy 行再落新行。
          // 顺序不能倒：INSERT IGNORE 撞 uk_notice_node（新码与某个 legacy 深码同号）会静默不插，
          // 然后后一句 DELETE 又把那个同码 legacy 行删掉 ⇒ 该公告归属直接变空（旧写法的真破口）。
          if (REPLACE_LEGACY) {
            const legacyDel = (await conn.query(`DELETE FROM \`${TABLE}\` WHERE notice_pk = ? AND source = ?`, [p.pk, ATTR_SOURCE_LEGACY]))[0] as unknown as { affectedRows: number };
            st.legacyDeleted += legacyDel.affectedRows;
          }
          // INSERT IGNORE（ADR-0014 结论 7 的写入侧修复，2026-10-14）：撞 uk_notice_node
          // 即该公告已有同码落点——保留既有行，绝不 ODKU 原地覆盖（那会把
          // source/model/confidence 审计线整条抹掉，存量归属被悄悄换源而门禁全绿）。
          await conn.query(`INSERT IGNORE INTO \`${TABLE}\` (notice_pk, node_code, level, confidence, source, model, evidence_text) VALUES (?, ?, ?, ?, ?, ?, ?)`, [p.pk, p.code, p.level, p.conf.toFixed(3), SRC, MODEL, p.reason]);
          await conn.query(`UPDATE taxonomy_intake SET status='resolved' WHERE notice_id=? AND status='pending'`, [p.notice_id]);
          // 粗落点清理（本人群专属，不走 --replace-legacy）：新行落进去后若还留着 L1 粗行，
          // 就是 AS1 混源 + BB15b 父子冗余。只删 legacy_tag 的粗码行；非 legacy 的粗行是不可重算
          // 的判定事实（与 assertDroppable 同纪律）⇒ 报错停下交人工，绝不默默删掉别人的判定。
          if (coarse > 0) {
            const foreign = (await conn.query(
              `SELECT source, COUNT(*) n FROM \`${TABLE}\`
                WHERE notice_pk = ? AND LENGTH(node_code) < ? AND source <> ? GROUP BY source`,
              [p.pk, ATTR_VALID_MIN_CODE_LEN, ATTR_SOURCE_LEGACY],
            ))[0] as unknown as Array<{ source: string; n: number }>;
            if (foreign.length) {
              throw new Error(`公告 ${p.pk} 的粗落点含非 legacy 行（${foreign.map((f) => `${f.source}=${f.n}`).join(" ")}）：不可重算的判定事实，禁止自动删除，交人工定`);
            }
            const coarseDel = (await conn.query(`DELETE FROM \`${TABLE}\` WHERE notice_pk = ? AND source = ? AND LENGTH(node_code) < ?`, [p.pk, ATTR_SOURCE_LEGACY, ATTR_VALID_MIN_CODE_LEN]))[0] as unknown as { affectedRows: number };
            st.coarseDeleted += coarseDel.affectedRows;
          }
          await conn.commit();
          st.written++;
        } catch (e) {
          await conn.rollback();
          throw e;
        }
      }
    } finally {
      conn.release();
    }
  }
  writeFileSync(STATE, JSON.stringify(st, null, 2), "utf8");
  console.log(`第 ${batchNo + 1} 批：扫 ${items.length} → 可落 ${ok.length}｜低置信 ${plans.filter((p) => p.verdict === "low-conf").length}｜NONE ${plans.filter((p) => p.verdict === "none" || p.verdict === "no-candidate").length}｜拒(形制/树外/过粗) ${plans.filter((p) => ["bad-shape", "phantom", "too-coarse", "llm-error"].includes(p.verdict)).length}${APPLY ? `｜已写 ${st.written}` : ""}${ZOOM.capped ? `｜精化超闸 ${ZOOM.capped}（维持父类，未截断）` : ""}`);
  batchNo++;
}

mkdirSync(join(process.cwd(), "runtime"), { recursive: true });
writeFileSync(`runtime/notice-attribution-content-ai-plan-${STAMP}.json`, JSON.stringify({ mode: APPLY ? "applied" : "dry", minConf: MIN_CONF, minLevel: MIN_LEVEL, ...st }, null, 2), "utf8");
console.log(`\n=== ${APPLY ? "已写库" : "DRY 写计划（未写库）"} ===`);
console.log(`扫描 ${st.scanned} 条（target=${TARGET}）公告 → 可落笔(conf≥${MIN_CONF},级≥L${MIN_LEVEL}) ${st.anchored}｜低置信留人工 ${st.lowConf}｜NONE ${st.none}｜被闸口拒 ${st.rejected}${APPLY ? `｜实际写落点+翻状态 ${st.written} 条` : ""}`);
console.log(`精化下钻：共 ${ZOOM.hops} 跳｜超 MAX_CHILDREN=${MAX_CHILDREN} 被闸住 ${ZOOM.capped} 条（树长大时会非 0，那些维持父类而非截断清单）`);
if (APPLY) console.log(`旧行清理：粗码 legacy 删 ${st.coarseDeleted} 行｜--replace-legacy 删 legacy ${st.legacyDeleted} 行（两者都只删 legacy_tag，非 legacy 行报错拦下）`);
console.log(`样例（前 12，看落点对不对再决定放量）：`);
for (const p of st.samples.slice(0, 12)) console.log(`  [${p.verdict} L${p.level} ${p.conf}] ${p.notice_id} → ${p.code} ${p.reason.slice(0, 30)}`);
console.log(`\n✓ 写计划/结果 → runtime/notice-attribution-content-ai-plan-${STAMP}.json；游标存 ${STATE}（--resume 续跑）`);
console.log(`⚠ 提醒：落点已进事实源；宽表 backbone_path 由落点表派生、指纹含落点段 ⇒ 下一轮对账自动重建，无需手刷（R2 切读已于 2026-10-14 完成）。`);
console.log(`LLM 用量（计费口径，全进程累计）：${USAGE.calls} 次调用｜输入 ${USAGE.prompt} tokens｜输出 ${USAGE.completion} tokens`);
await pool.end();
