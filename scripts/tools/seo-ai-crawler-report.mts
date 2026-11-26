/**
 * AI 爬虫周报 —— 聚合 pm2 日志里的 [ai-crawler] 行，按爬虫/频率/路径出报告
 *
 * @module scripts/tools/seo-ai-crawler-report
 * @description proxy.ts 的 [ai-crawler] 分支只记 UA + 路径（GPTBot/OAI-SearchBot/
 *              ChatGPT-User/ClaudeBot/Claude-Web/PerplexityBot/Google-Extended/
 *              CCBot/Bytespider 九类，ADR-0023 保留的可观测性分支）。本脚本把
 *              这些行聚合成周报：哪些引擎在来访、频率趋势、在逛哪些页面、
 *              公告详情的去重覆盖量——GEO 引用率的前置监控位。
 *
 *              约束与 push-new-notices.mts 相同：服务器 /root/supply-os 只有
 *              standalone 产物与 scripts/，没有 src 树 ⇒ 纯 Node 标准库、零 src import。
 *              不读库、不需要 .env。
 *
 * 用法：
 *   npx tsx scripts/tools/seo-ai-crawler-report.mts                    # 默认 7 天 + pm2 默认日志目录
 *   npx tsx scripts/tools/seo-ai-crawler-report.mts --days=14
 *   npx tsx scripts/tools/seo-ai-crawler-report.mts /path/to/out.log   # 显式指定日志文件（可多个）
 *   npx tsx scripts/tools/seo-ai-crawler-report.mts --indexable=151802 # 附可索引集合覆盖率
 *   npx tsx scripts/tools/seo-ai-crawler-report.mts --self-test        # 内置夹具自测
 *
 * 输出：Markdown 报告打印到 stdout，并写入 runtime/seo/ai-crawler-report-<date>.md
 *       （runtime 不进仓库、部署不清除）。
 * 日志：pm2 console.log 落 ~/.pm2/logs/supply-os-out.log（含轮转副本 -1/-2…）。
 */
import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";

// ── CLI 参数 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const numArg = (key: string, fallback: number): number => {
  const hit = args.find((a) => a.startsWith(`--${key}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const DAYS = numArg("days", 7);
const INDEXABLE = args.some((a) => a.startsWith("--indexable=")) ? numArg("indexable", 0) : null;
const explicitFiles = args.filter((a) => !a.startsWith("--"));

/** 爬虫 → 归属引擎（顺序即匹配优先级；对齐 proxy.ts 的 UA 正则名单） */
const BOTS: Array<[pattern: RegExp, name: string, vendor: string]> = [
  [/GPTBot/i, "GPTBot", "OpenAI（训练采集）"],
  [/OAI-SearchBot/i, "OAI-SearchBot", "OpenAI（搜索索引）"],
  [/ChatGPT-User/i, "ChatGPT-User", "OpenAI（用户实时抓取）"],
  [/ClaudeBot|Claude-Web/i, "ClaudeBot", "Anthropic"],
  [/PerplexityBot/i, "PerplexityBot", "Perplexity"],
  [/Google-Extended/i, "Google-Extended", "Google（AI 训练授权）"],
  [/CCBot/i, "CCBot", "Common Crawl"],
  [/Bytespider/i, "Bytespider", "字节跳动"],
];

const botOf = (ua: string): { name: string; vendor: string } | null => {
  for (const [re, name, vendor] of BOTS) {
    if (re.test(ua)) return { name, vendor };
  }
  return null;
};

/** 日志行解析三态：ok=有效行；bad=带 [ai-crawler] 前缀但坏行（如坏时间戳）；null=非目标行 */
export type ParsedAiCrawlerLine =
  | { kind: "ok"; ts: number; pathname: string; ua: string }
  | { kind: "bad" }
  | null;

export function parseAiCrawlerLine(line: string): ParsedAiCrawlerLine {
  const m = line.match(/^\[ai-crawler\] (\S+) (\S+) (.+)$/);
  if (!m) return null;
  const ts = Date.parse(m[1]);
  if (!Number.isFinite(ts)) return { kind: "bad" };
  return { kind: "ok", ts, pathname: m[2], ua: m[3] };
}

/** 日期桶：日志是 UTC ISO，报表按北京日界（UTC+8）归天，与全站日期口径一致 */
const dayKeyOf = (ts: number): string => new Date(ts + 8 * 3600_000).toISOString().slice(0, 10);

/** 路径归类：公告详情单独拎出来（它的覆盖量才是 GEO 关注的核心），其余按前缀 */
function pathBucket(pathname: string): string {
  const notice = pathname.match(/^\/procurement\/notice\/(\d+)(\/|$)/);
  if (notice) return "/procurement/notice/[id]";
  const known = [
    "/procurement", "/supplier", "/membership", "/training", "/learning", "/services",
    "/ecosystem", "/rfq", "/award-intelligence", "/about", "/notice-source", "/faq",
    "/robots.txt", "/sitemap", "/api/",
  ];
  for (const p of known) if (pathname.startsWith(p)) return p;
  return "(其他)";
}

/** 聚合容器：全部有界（bot 数 ≤ 已知名单、桶 ≤ 前缀数、日期 ≤ 窗口天数） */
interface Agg {
  total: number;
  skipped: number;
  byBot: Map<string, { vendor: string; hits: number; days: Set<string>; first: number; last: number; paths: Map<string, number> }>;
  byDay: Map<string, Map<string, number>>;
  buckets: Map<string, number>;
  noticeIds: Set<string>;
  noticeTop: Map<string, number>;
}

const newAgg = (): Agg => ({
  total: 0, skipped: 0,
  byBot: new Map(), byDay: new Map(), buckets: new Map(),
  noticeIds: new Set(), noticeTop: new Map(),
});

export function aggregateLine(agg: Agg, line: string, windowStart: number, windowEnd: number): void {
  const parsed = parseAiCrawlerLine(line);
  if (!parsed) return;
  if (parsed.kind === "bad") { agg.skipped += 1; return; }
  if (parsed.ts < windowStart || parsed.ts > windowEnd) return;
  const bot = botOf(parsed.ua);
  if (!bot) { agg.skipped += 1; return; } // 名单外 UA：proxy 名单可能已漂移，浮出来而不是吞掉
  agg.total += 1;

  let b = agg.byBot.get(bot.name);
  if (!b) {
    b = { vendor: bot.vendor, hits: 0, days: new Set(), first: parsed.ts, last: parsed.ts, paths: new Map() };
    agg.byBot.set(bot.name, b);
  }
  b.hits += 1;
  b.days.add(dayKeyOf(parsed.ts));
  b.first = Math.min(b.first, parsed.ts);
  b.last = Math.max(b.last, parsed.ts);
  const bucket = pathBucket(parsed.pathname);
  b.paths.set(bucket, (b.paths.get(bucket) ?? 0) + 1);
  agg.buckets.set(bucket, (agg.buckets.get(bucket) ?? 0) + 1);

  const day = dayKeyOf(parsed.ts);
  let d = agg.byDay.get(day);
  if (!d) { d = new Map(); agg.byDay.set(day, d); }
  d.set(bot.name, (d.get(bot.name) ?? 0) + 1);

  const nm = parsed.pathname.match(/^\/procurement\/notice\/(\d+)/);
  if (nm) {
    agg.noticeIds.add(nm[1]);
    agg.noticeTop.set(nm[1], (agg.noticeTop.get(nm[1]) ?? 0) + 1);
  }
}

const fmtTime = (ts: number): string => {
  const d = new Date(ts + 8 * 3600_000);
  return `${d.toISOString().slice(0, 16).replace("T", " ")} 北京`;
};

const topN = (m: Map<string, number>, n: number): Array<[string, number]> =>
  [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, n);

// ── 自测：内置夹具锁定解析/聚合三条语义 ─────────────────────────────────────
function selfTest(): void {
  const start = Date.parse("2026-11-20T00:00:00Z");
  const end = Date.parse("2026-11-27T00:00:00Z");
  const agg = newAgg();
  const lines = [
    "[ai-crawler] 2026-11-21T03:00:00.000Z /procurement/notice/12345 Mozilla/5.0 (compatible; GPTBot/1.2)",
    "[ai-crawler] 2026-11-21T04:00:00.000Z /procurement Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "[ai-crawler] 2026-11-22T10:00:00.000Z /procurement/notice/12345 Mozilla/5.0 AppleWebKit/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "[ai-crawler] 2026-11-19T23:59:59.000Z /procurement/notice/1 Mozilla/5.0 (compatible; GPTBot/1.2)", // 窗口外
    "[ai-crawler] not-a-date /x GPTBot", // 坏时间戳 → bad
    "[ai-crawler] 2026-11-21T05:00:00.000Z /x SomeUnknownBot/1.0", // 名单外 UA → skipped
    "GET /healthz 200", // 非 ai-crawler 行 → 直接忽略
  ];
  for (const l of lines) aggregateLine(agg, l, start, end);
  const assert = (cond: boolean, msg: string) => { if (!cond) { console.error(`self-test FAIL: ${msg}`); process.exit(1); } };
  assert(agg.total === 3, `窗口内应为 3 条，实际 ${agg.total}`);
  assert(agg.skipped === 2, `坏时间戳 + 名单外 UA 应计入 skipped=2，实际 ${agg.skipped}`);
  assert(agg.byBot.get("GPTBot")?.hits === 1, "GPTBot 应 1 次");
  assert(agg.byBot.get("ClaudeBot")?.hits === 1, "ClaudeBot/Claude-Web 应归并 1 次");
  assert(agg.byBot.get("Bytespider")?.hits === 1, "Bytespider 应 1 次");
  assert(agg.noticeIds.has("12345") && !agg.noticeIds.has("1"), "公告去重应含 12345、排除窗口外 id=1");
  assert(dayKeyOf(Date.parse("2026-11-20T20:00:00Z")) === "2026-11-21", "UTC 20 点应归北京次日");
  console.log("self-test OK（7 条夹具：窗口过滤/坏行跳过/UA 归并/北京日界）");
}

// ── 报告渲染 ──────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (args.includes("--self-test")) { selfTest(); return; }

  const windowEnd = Date.now();
  const windowStart = windowEnd - DAYS * 86400_000;
  const from = dayKeyOf(windowStart);
  const to = dayKeyOf(windowEnd);

  // 日志文件：显式参数 > pm2 默认目录扫描
  let files = explicitFiles;
  if (files.length === 0) {
    const pm2Dir = path.join(os.homedir(), ".pm2", "logs");
    files = existsSync(pm2Dir)
      ? readdirSync(pm2Dir).filter((f) => /^supply-os-out.*\.log$/.test(f)).sort().map((f) => path.join(pm2Dir, f))
      : [];
    if (files.length === 0) {
      console.error(`[ai-crawler-report] 未找到日志：${pm2Dir} 下无 supply-os-out*.log，可用参数显式指定文件`);
      process.exit(1);
    }
  }

  const agg = newAgg();
  for (const file of files) {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) aggregateLine(agg, line, windowStart, windowEnd);
  }

  // ── 渲染 Markdown ──
  const L: string[] = [];
  L.push(`# AI 爬虫周报（${from} ~ ${to}，北京日界，窗口 ${DAYS} 天）`);
  L.push("");
  L.push(`- 数据源：${files.length} 个日志文件；解析 ${agg.total} 条 AI 爬虫请求，跳过坏行 ${agg.skipped}`);
  if (agg.total === 0) {
    L.push("- 窗口内**无任何 AI 爬虫来访**——若是首次运行属正常（日志分支刚上线）；若持续为零需检查 robots/推送链路。");
  } else {
    L.push(`- 到访引擎 ${agg.byBot.size} 个；公告详情去重 **${agg.noticeIds.size}** 条${INDEXABLE ? `，占可索引集合 ${INDEXABLE} 的 ${((agg.noticeIds.size / INDEXABLE) * 100).toFixed(1)}%` : ""}`);
    L.push("");
    L.push("## 按引擎");
    L.push("");
    L.push("| 引擎 | 归属 | 请求 | 活跃天 | 日均 | 首次到访（北京） | 末次到访（北京） |");
    L.push("|---|---|---|---|---|---|---|");
    for (const [name, b] of [...agg.byBot.entries()].sort((a, x) => x[1].hits - a[1].hits)) {
      L.push(`| ${name} | ${b.vendor} | ${b.hits} | ${b.days.size} | ${(b.hits / DAYS).toFixed(1)} | ${fmtTime(b.first)} | ${fmtTime(b.last)} |`);
    }
    L.push("");
    L.push("## 每日趋势");
    L.push("");
    const botNames = [...agg.byBot.keys()];
    L.push(`| 日期 | ${botNames.join(" | ")} | 合计 |`);
    L.push(`|---|${botNames.map(() => "---").join("|")}|---|`);
    for (const [day, perBot] of [...agg.byDay.entries()].sort()) {
      const cells = botNames.map((n) => perBot.get(n) ?? 0);
      L.push(`| ${day} | ${cells.join(" | ")} | ${cells.reduce((a, c) => a + c, 0)} |`);
    }
    L.push("");
    L.push("## 路径分布（全站）");
    L.push("");
    L.push("| 路径 | 请求 | 占比 |");
    L.push("|---|---|---|");
    for (const [p, n] of topN(agg.buckets, 15)) {
      L.push(`| \`${p}\` | ${n} | ${((n / agg.total) * 100).toFixed(1)}% |`);
    }
    if (agg.noticeIds.size > 0) {
      L.push("");
      L.push("## 公告详情被逛 TOP10");
      L.push("");
      L.push("| 公告 id | 请求 |");
      L.push("|---|---|");
      for (const [id, n] of topN(agg.noticeTop, 10)) L.push(`| ${id} | ${n} |`);
    }
    L.push("");
    L.push("## 各引擎路径偏好");
    L.push("");
    for (const [name, b] of agg.byBot) {
      const tops = topN(b.paths, 3).map(([p, n]) => `\`${p}\`×${n}`).join("、");
      L.push(`- ${name}：${tops}`);
    }
  }
  L.push("");
  const report = L.join("\n");

  console.log(report);
  mkdirSync("runtime/seo", { recursive: true });
  // 文件名按日切分 ⇒ 每周一跑一次天然形成历史序列；同日重跑幂等覆盖，不堆副本
  const outFile = path.join("runtime", "seo", `ai-crawler-report-${dayKeyOf(windowEnd)}.md`);
  writeFileSync(outFile, report + "\n");
  console.error(`\n[ai-crawler-report] 已写入 ${outFile}`);
}

main().catch((err) => {
  console.error(`[ai-crawler-report] FAIL: ${(err as Error).message}`);
  process.exit(1);
});
