/**
 * 公告 UGT 打标后台任务（应用内，人工触发）
 * Notice UGT tagging background job (in-app, manually triggered)
 *
 * @module lib/services/commodity/notice-tagging
 * @description 把 ops 脚本（scripts/ops/notice-attribution-content-ai.ts）验证过的
 *              「按内容回写 UGT 落点」管道搬进应用内，供后台「公告打标」页人工触发：
 *              stage1 定域（32 大类闭集）→ stage2 候选召回 + LLM 选点 → stage3 精化
 *              （zoom-in：非 L5 落点把所选节点下两层真实子节点全量复问，精确叶子存在必选、
 *              没有则维持父类）→ 四闸落笔。
 *
 * ⚑ AI 触发权归用户（硬约束，与 ops 脚本同一纪律）：本模块没有任何自动/定时调用，
 *   只有后台页「开始打标」按钮（admin API）才会启动；不接 instrumentation、不进调度器。
 *
 * 与脚本的三点差异（2026-10-15 后台化定稿）：
 *   - 只跑单判定（不做双跑共识）；temperature 锁 0.1（服务商路由抖动压不掉，但采样发散已锁死）；
 *   - 低置信公告把 AI 建议（code/reason）回写进 crm_taxonomy_intake（status 保持 pending），
 *     供「公告管理」页人工确认——这是脚本没有的落点，确认通道在 admin API confirm；
 *   - 每批处理完把变更公告 id 推进宽表同步队列（enqueue），门户即时可见。
 *
 * 写入面（与脚本完全同口径）：
 *   - crm_notice_attribution_nodes：INSERT IGNORE（撞 uk_notice_node 保留原行，绝不覆盖审计线），
 *     source='ai_content'；
 *   - crm_taxonomy_intake：成功 pending→resolved；低置信只回填建议。
 * 宽表 backbone_path 是派生列（buildWideRow 读落点表算），本模块不直接写宽表。
 */
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import {
  backboneNodeLevel,
  loadBackboneIndex,
  type BackboneIndex,
} from "@/lib/services/commodity/backbone-path";
import { assertAttributionNode } from "@/lib/services/commodity/attribution";
import { ACTIVE_NOTICE_WHERE } from "@/lib/utils/notice-expired";
import { enqueue as enqueueWideSync } from "@/lib/services/search-sync/sync-queue";

// ── 配置（env 可调，默认=2026-10-15 试跑验证过的口径）──
const MIN_CONF = Number(process.env.NOTICE_TAGGING_MIN_CONF || 0.75);
const MIN_LEVEL = 2;
const BATCH = 40;
const CONC = Math.max(1, Math.min(10, Number(process.env.NOTICE_TAGGING_CONC) || 4));
const TOPK = 60;
const DESC_CAP = 500;
const MODEL = process.env.PROBE_LLM_MODEL || "deepseek-flash";
const SRC = "ai_content";
/** 单次运行上限（后台页输入的上限，防手滑放全量） */
export const RUN_LIMIT_MAX = 2000;

const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const apiKey = process.env.DEEPSEEK_API_KEY || "";

// ── 运行状态（进程内单例：单实例部署零成本；多实例时天然互不可见，各跑各的互不冲突）──
export type TaggingPhase = "idle" | "loading" | "classifying";

export interface TaggingRunStatus {
  running: boolean;
  phase: TaggingPhase;
  limit: number | null;
  processed: number;
  written: number;
  lowConf: number;
  none: number;
  rejected: number;
  startedAt: string | null;
  finishedAt: string | null;
  stopRequested: boolean;
  recentErrors: string[];
  /** 本轮 LLM 用量（计费口径） */
  usage: { calls: number; promptTokens: number; completionTokens: number };
}

interface RunState extends TaggingRunStatus {
  lastId: number;
  /** 跨轮累计用量（进程生命周期内），供成本页展示 */
  usageLifetime: { calls: number; promptTokens: number; completionTokens: number };
}

const g = globalThis as unknown as { _noticeTaggingRun?: RunState };

function state(): RunState {
  if (!g._noticeTaggingRun) {
    g._noticeTaggingRun = {
      running: false, phase: "idle", limit: null, processed: 0, written: 0, lowConf: 0,
      none: 0, rejected: 0, startedAt: null, finishedAt: null, stopRequested: false,
      recentErrors: [], lastId: 0,
      usage: { calls: 0, promptTokens: 0, completionTokens: 0 },
      usageLifetime: { calls: 0, promptTokens: 0, completionTokens: 0 },
    };
  }
  return g._noticeTaggingRun;
}

function freshRun(limit: number): RunState {
  const s = state();
  s.running = true; s.phase = "loading"; s.limit = limit;
  s.processed = 0; s.written = 0; s.lowConf = 0; s.none = 0; s.rejected = 0;
  s.startedAt = new Date().toISOString(); s.finishedAt = null; s.stopRequested = false;
  s.recentErrors = []; s.lastId = 0;
  s.usage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  return s;
}

export function getRunStatus(): TaggingRunStatus {
  const s = state();
  return {
    running: s.running, phase: s.phase, limit: s.limit, processed: s.processed,
    written: s.written, lowConf: s.lowConf, none: s.none, rejected: s.rejected,
    startedAt: s.startedAt, finishedAt: s.finishedAt, stopRequested: s.stopRequested,
    recentErrors: [...s.recentErrors], usage: { ...s.usage },
  };
}

/** 覆盖统计（与队列同一「活跃」口径：ACTIVE_NOTICE_WHERE） */
export async function getTaggingStats(pool: Pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(EXISTS (SELECT 1 FROM crm_notice_attribution_nodes a WHERE a.notice_pk = n.id)) covered
       FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`,
  );
  const [pending] = await pool.query(
    `SELECT COUNT(*) n FROM crm_taxonomy_intake WHERE status = 'pending'`,
  );
  const [sources] = await pool.query(
    `SELECT source, COUNT(*) n FROM crm_notice_attribution_nodes GROUP BY source`,
  );
  const total = Number((rows as Array<{ total: number }>)[0]?.total ?? 0);
  const covered = Number((rows as Array<{ covered: number }>)[0]?.covered ?? 0);
  return {
    totalNotices: total,
    coveredNotices: covered,
    uncoveredNotices: total - covered,
    coverage: total > 0 ? Math.round((covered * 100) / total) : 0,
    intakePending: Number((pending as Array<{ n: number }>)[0]?.n ?? 0),
    bySource: Object.fromEntries(
      (sources as Array<{ source: string; n: number }>).map((r) => [r.source, Number(r.n)]),
    ),
  };
}

// ── LLM（温度锁 0.1 + 用量累计；无 key 时启动即报错，不在任务中途静默失败）──
const usage = { calls: 0, promptTokens: 0, completionTokens: 0 };

function trackUsage(u?: { prompt_tokens?: number; completion_tokens?: number }) {
  usage.calls++;
  usage.promptTokens += Number(u?.prompt_tokens ?? 0);
  usage.completionTokens += Number(u?.completion_tokens ?? 0);
}

async function chat(prompt: string, ms = 30_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.1,
        thinking: { type: "disabled" },
      }),
    });
    if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    trackUsage(data?.usage);
    return String(data?.choices?.[0]?.message?.content ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
  } finally {
    clearTimeout(t);
  }
}

const extractJson = (raw: string): unknown | null => {
  const m = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
};

/** 标题基本已是中文就不用再花一次翻译调用（混合批次只翻非中文的） */
function mostlyCjk(s: string): boolean {
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  return s.length > 0 && cjk / s.length > 0.5;
}

async function translateZh(pool: Pool, titles: string[]): Promise<string[]> {
  const need = titles.map((t) => !mostlyCjk(t));
  const targets = titles.filter((_, i) => need[i]);
  const out = [...titles];
  for (let i = 0; i < targets.length; i += 50) {
    const chunk = targets.slice(i, i + 50);
    const p = `Translate each procurement notice title to concise Chinese. Output ONLY a JSON array of ${chunk.length} strings, same order, no explanation.\nInput: ${JSON.stringify(chunk)}\nOutput(JSON array[${chunk.length}]):`;
    try {
      const a = extractJson(await chat(p, 60_000));
      if (Array.isArray(a) && a.length === chunk.length) {
        let k = 0;
        for (let j = 0; j < titles.length; j++) {
          if (need[j]) out[j] = String(a[k++] ?? "").trim() || titles[j];
        }
      }
    } catch {
      /* 翻译失败用原标题，不中断 */
    }
  }
  return out;
}

async function runPool<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const res = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        res[idx] = await fn(items[idx]);
      }
    }),
  );
  return res;
}

// ── 单条公告：stage1 定域 → stage2 召回+选点 → stage3 zoom-in 精化 ──
type Verdict = "anchor" | "low-conf" | "none" | "no-candidate" | "bad-shape" | "phantom" | "too-coarse" | "llm-error";
interface Plan {
  pk: number;
  noticeId: string;
  code: string;
  level: number;
  conf: number;
  reason: string;
  verdict: Verdict;
}

const ancestorCodes = (code: string): string[] => {
  const b = code.slice(4);
  const o: string[] = [];
  for (let l = 2; l <= b.length; l += 2) o.push("UGT-" + b.slice(0, l));
  return o;
};

async function anchorOne(
  pool: Pool,
  idx: BackboneIndex,
  l1rows: Array<{ code: string; name_zh: string; name_en: string }>,
  l1set: Set<string>,
  l1List: string,
  n: { pk: number; noticeId: string; title: string; desc: string; zh: string },
): Promise<Plan> {
  const plan: Plan = { pk: n.pk, noticeId: n.noticeId, code: "", level: 0, conf: 0, reason: "", verdict: "llm-error" };
  const q = async <T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]> =>
    (await pool.query(sql, p))[0] as unknown as T[];

  // stage1 定域：32 大类闭集选最多 2 个
  const s1 = `以下是采购公告，请从给定的 ${l1rows.length} 个大类里选出它所属的最多 2 个大类编号（只能选列表里的编号）。只输出 JSON 数组，如 ["UGT-01","UGT-04"]，无合适则 []。\n\n大类列表：\n${l1List}\n\n公告标题：${n.title}\n${n.zh ? `标题中文：${n.zh}\n` : ""}公告正文（截断）：${n.desc.slice(0, DESC_CAP)}\n\n输出(JSON array):`;
  let groups: string[] = [];
  try {
    const p = extractJson(await chat(s1));
    if (Array.isArray(p)) groups = p.map((x) => String(x).trim()).filter((x) => /^UGT-\d{2}$/.test(x) && l1set.has(x)).slice(0, 2);
  } catch {
    /* 无域 */
  }

  // stage2 候选：域内 L2+L3 枚举 ∪ 域内 L4/L5 FULLTEXT 召回 ∪ 全局兜底
  const cand = new Map<string, number>();
  const add = (code: string, w: number) => cand.set(code, Math.max(cand.get(code) ?? 0, w));
  if (groups.length) {
    const likeSql = groups.map(() => "code LIKE ?").join(" OR ");
    const gp = groups.map((g) => g + "%");
    for (const r of await q<{ code: string }>(`SELECT code FROM crm_commodity_backbone WHERE status=1 AND level IN (2,3) AND (${likeSql})`, gp)) add(r.code, 3);
    for (const query of [n.zh, n.title].filter(Boolean)) {
      const deep = await q<{ code: string; rel: number }>(
        `SELECT code, MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) rel FROM crm_commodity_backbone WHERE status=1 AND level IN (4,5) AND (${likeSql}) AND MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) ORDER BY rel DESC LIMIT ?`,
        [query, ...gp, query, TOPK],
      );
      for (const r of deep) add(r.code, 2 + Number(r.rel) / 1000);
    }
  }
  for (const query of [n.zh, n.title].filter(Boolean)) {
    const g2 = await q<{ code: string; rel: number }>(
      `SELECT code, MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) rel FROM crm_commodity_backbone WHERE status=1 AND MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) ORDER BY rel DESC, level DESC LIMIT ?`,
      [query, query, TOPK],
    );
    for (const r of g2) add(r.code, 1 + Number(r.rel) / 1000);
  }
  if (cand.size === 0) {
    plan.verdict = "no-candidate";
    return plan;
  }
  const sel = new Map(cand);
  for (const [code, w] of cand) for (const a of ancestorCodes(code)) if (!sel.has(a)) sel.set(a, w - 1);
  const codes = [...sel.keys()];
  const meta = new Map(
    (await q<{ code: string; name_zh: string; level: number }>(
      `SELECT code, name_zh, level FROM crm_commodity_backbone WHERE code IN (${codes.map(() => "?").join(",")}) AND status=1`,
      codes,
    )).map((r) => [r.code, { name: r.name_zh, level: r.level }]),
  );
  const list = codes
    .filter((x) => meta.has(x))
    .sort((a, b) => sel.get(b)! - sel.get(a)! || meta.get(b)!.level - meta.get(a)!.level)
    .slice(0, 160)
    .map((code) => ({ code, path: ancestorCodes(code).map((a) => meta.get(a)?.name ?? "?").join(">") }));

  // stage2 选点：容纳优先于相近（宁上勿偏），confidence 语义对齐容纳准确度
  const s2 = `你是政府采购品目归类器。给你一条公告和一组【已存在的】候选品目节点（编号 | 层级路径 大类>中类>小类>子类>品目）。任务：选出公告所属的节点编号——判定标准是【容纳】，不是【相近】。规则：只能选候选里的编号，【禁止提新码/新类目】；候选里的叶子品目与公告标的物【完全对应】时才选叶子（越深越好）；叶子对应不上、但其父类(L4/L3/L2)能容纳时，【必须上挂父类】——语义相近但指代不同标的物的近邻叶子视为不贴切，宁上挂父类也不选它；【不得选 L1 大类】；候选里任何层级都不沾边才输出 NONE。confidence 只反映【容纳准确度】：上挂父类是正确行为，照常给高 confidence；只有选中「相近但不对应」的节点时才给低 confidence。只输出一个 JSON 对象，无解释无 markdown：{"code":"...","confidence":0.0到1.0,"reason":"一句话依据"}\n\n公告标题：${n.title}\n${n.zh ? `标题中文：${n.zh}\n` : ""}公告正文（截断）：${n.desc.slice(0, DESC_CAP)}\n\n候选：\n${list.map((x, k) => `[${k + 1}] ${x.code} | ${x.path}`).join("\n")}\n\n输出(JSON):`;
  let pick: { code: string; confidence: number; reason: string };
  try {
    const o = extractJson(await chat(s2));
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const r = o as Record<string, unknown>;
      pick = { code: String(r.code ?? "NONE").trim(), confidence: Number(r.confidence) || 0, reason: String(r.reason ?? "").slice(0, 160) };
    } else {
      plan.verdict = "llm-error";
      return plan;
    }
  } catch {
    plan.verdict = "llm-error";
    return plan;
  }
  plan.code = pick.code;
  plan.conf = pick.confidence;
  plan.reason = pick.reason;
  if (pick.code === "NONE") {
    plan.verdict = "none";
    return plan;
  }

  // 双闸 + 深度闸（与 ops 脚本同口径：形制 → 树内 → ≥L2）
  let code: string;
  try {
    code = assertAttributionNode(pick.code, n.pk);
  } catch {
    plan.verdict = "bad-shape";
    return plan;
  }
  if (!idx.nodeOf(code)) {
    plan.verdict = "phantom";
    return plan;
  }
  const lv = backboneNodeLevel(code);
  if (lv < MIN_LEVEL) {
    plan.level = lv;
    plan.verdict = "too-coarse";
    return plan;
  }
  plan.level = lv;

  // stage3 zoom-in 精化：非 L5 时把所选节点下两层【全部真实子节点】查库复问——
  // 精确叶子存在必然在清单里（不经过召回截断），没有则维持父类。
  if (lv < 5) {
    const lvls = [lv + 1, ...(lv + 2 <= 5 ? [lv + 2] : [])];
    const desc = await q<{ code: string; name_zh: string; level: number }>(
      `SELECT code, name_zh, level, MATCH(name_zh,name_en) AGAINST(? IN NATURAL LANGUAGE MODE) rel
         FROM crm_commodity_backbone
        WHERE status=1 AND level IN (${lvls.join(",")}) AND code LIKE ?
        ORDER BY rel DESC, code LIMIT 120`,
      [`${n.zh} ${n.title}`, `${code}%`],
    );
    if (desc.length > 0) {
      const s3 = `你是政府采购品目归类器的精化器。公告此前被归入父类 ${code}（${meta.get(code)?.name ?? ""}）。下面是该父类之下更深层级的子节点（编号|层级|名称）。任务：其中若有与公告标的物【完全对应】的更深节点，必须选它（精确优先于上挂）；若【没有任何一个】完全对应，则维持父类 ${code} 不变——宁上勿偏，禁止选相近但不完全对应的节点。code 只能是 ${code} 本身或列表中的编号。只输出一个 JSON 对象，无解释无 markdown：{"code":"...","confidence":0.0到1.0,"reason":"一句话依据"}\n\n公告标题：${n.title}\n${n.zh ? `标题中文：${n.zh}\n` : ""}公告正文（截断）：${n.desc.slice(0, DESC_CAP)}\n\n子节点：\n${desc.map((x) => `${x.code} | L${x.level} | ${x.name_zh}`).join("\n")}\n\n输出(JSON):`;
      try {
        const o3 = extractJson(await chat(s3));
        if (o3 && typeof o3 === "object" && !Array.isArray(o3)) {
          const r3 = o3 as Record<string, unknown>;
          const c3 = String(r3.code ?? "").trim();
          const conf3 = Number(r3.confidence) || 0;
          if (c3 === code) {
            plan.conf = conf3 || plan.conf;
          } else if (desc.some((d) => d.code === c3)) {
            const code3 = assertAttributionNode(c3, n.pk);
            const lv3 = backboneNodeLevel(code3);
            if (lv3 >= MIN_LEVEL && idx.nodeOf(code3)) {
              plan.code = code3;
              plan.level = lv3;
              plan.conf = conf3 || plan.conf;
              plan.reason = String(r3.reason ?? "").slice(0, 160);
            }
          }
        }
      } catch {
        /* 精化失败维持 stage2 判定 */
      }
    }
  }
  plan.verdict = plan.conf >= MIN_CONF ? "anchor" : "low-conf";
  return plan;
}

// ── 后台主循环 ──
async function runLoop(s: RunState): Promise<void> {
  const pool = getPool();
  try {
    const idx = await loadBackboneIndex(<T>(sql: string) => pool.query(sql).then((r) => r[0] as T[]));
    const l1rows = (await pool.query(
      `SELECT code, name_zh, name_en FROM crm_commodity_backbone WHERE level=1 AND status=1 ORDER BY code`,
    ).then((r) => r[0])) as Array<{ code: string; name_zh: string; name_en: string }>;
    const l1set = new Set(l1rows.map((r) => r.code));
    const l1List = l1rows.map((r) => `${r.code} ${r.name_zh}${r.name_en ? " / " + r.name_en : ""}`).join("\n");
    s.phase = "classifying";

    for (;;) {
      if (s.stopRequested || s.processed >= (s.limit ?? 0)) break;
      // 单批也受上限约束：limit=3 就只拉 3 条，绝不超发 AI 调用
      const remaining = (s.limit ?? 0) - s.processed;
      const batchLimit = Math.max(1, Math.min(BATCH, remaining));
      const rows = (await pool.query(
        `SELECT n.id pk, n.notice_id, n.title, n.description FROM crm_bid_notices n
          WHERE n.id > ? AND EXISTS (SELECT 1 FROM crm_taxonomy_intake i WHERE i.notice_id = n.notice_id AND i.status = 'pending')
            AND NOT EXISTS (SELECT 1 FROM crm_notice_attribution_nodes a WHERE a.notice_pk = n.id)
            AND ${ACTIVE_NOTICE_WHERE}
          ORDER BY n.id LIMIT ${batchLimit}`,
        [s.lastId],
      ).then((r) => r[0])) as Array<{ pk: number; notice_id: string; title: string | null; description: string | null }>;
      if (rows.length === 0) break;

      const zh = await translateZh(pool, rows.map((r) => String(r.title ?? "")));
      const items = rows.map((r, i) => ({
        pk: Number(r.pk),
        noticeId: String(r.notice_id),
        title: String(r.title ?? ""),
        desc: String(r.description ?? ""),
        zh: zh[i] ?? "",
      }));
      s.lastId = Math.max(s.lastId, ...items.map((x) => x.pk));

      const plans = await runPool(items, CONC, (it) => anchorOne(pool, idx, l1rows, l1set, l1List, it));
      const changedIds: number[] = [];

      for (const p of plans) {
        s.processed++;
        if (p.verdict === "anchor") {
          s.written++;
          changedIds.push(p.pk);
          // INSERT IGNORE：撞 uk_notice_node 说明已有落点，保留原行（不覆盖审计线）
          await pool.query(
            `INSERT IGNORE INTO crm_notice_attribution_nodes (notice_pk, node_code, level, confidence, source, model, evidence_text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [p.pk, p.code, p.level, p.conf.toFixed(3), SRC, MODEL, p.reason],
          );
          await pool.query(`UPDATE crm_taxonomy_intake SET status='resolved' WHERE notice_id=? AND status='pending'`, [p.noticeId]);
        } else if (p.verdict === "low-conf") {
          s.lowConf++;
          // 低置信：AI 建议回写队列（status 保持 pending），交「公告管理」人工确认
          await pool.query(
            `UPDATE crm_taxonomy_intake SET code=?, reason=? WHERE notice_id=? AND status='pending'`,
            [p.code, `AI建议 ${p.code}（conf ${p.conf.toFixed(2)}）：${p.reason}`.slice(0, 500), p.noticeId],
          );
        } else if (p.verdict === "none" || p.verdict === "no-candidate") {
          s.none++;
        } else {
          s.rejected++;
        }
      }

      // 每批推进宽表同步队列（500ms 内批量消化 → 宽表 → Meili），门户即时可见
      if (changedIds.length > 0) enqueueWideSync(pool, changedIds);

      // 用量同步（无条件：usage 是模块级累计器，state 只是它的展示快照）
      s.usage = { ...usage };
      s.usageLifetime = { ...usage };
    }
  } catch (err) {
    s.recentErrors.unshift(`[${new Date().toISOString()}] ${err instanceof Error ? err.message : String(err)}`);
    s.recentErrors = s.recentErrors.slice(0, 20);
  } finally {
    s.running = false;
    s.phase = "idle";
    s.finishedAt = new Date().toISOString();
    s.usageLifetime = { ...usage };
  }
}

/** 启动一轮打标（人工触发口）。已在运行或未配 LLM key 时拒绝并说明原因。 */
export function startTaggingRun(limit: number): { ok: boolean; message: string } {
  const s = state();
  if (s.running) return { ok: false, message: "已有打标任务在运行，请等它结束或先停止" };
  if (!apiKey) return { ok: false, message: "未配置 DEEPSEEK_API_KEY，无法调用 AI（请在运行环境补齐后重启）" };
  const lim = Math.floor(Number(limit));
  if (!Number.isFinite(lim) || lim < 1) return { ok: false, message: "处理条数上限需为正整数" };
  const capped = Math.min(lim, RUN_LIMIT_MAX);
  const run = freshRun(capped);
  void runLoop(run);
  return { ok: true, message: capped < lim ? `已达单轮上限 ${RUN_LIMIT_MAX}，本轮按 ${capped} 条执行` : "已启动" };
}

/** 请求停止：当前批次完成后退出（幂等） */
export function requestTaggingStop(): void {
  state().stopRequested = true;
}
