/**
 * 新公告双通道推送（百度主动推送 + IndexNow）
 *
 * @module scripts/tools/push-new-notices
 * @description 新公告落库后主动告知搜索引擎，把「发布→发现」延迟从爬虫顺
 *              sitemap 慢逛压到分钟级。双通道配额不对等，游标分开：
 *              - IndexNow：无配额限制 → 推全部新公告（indexnowLastId 全量前进）
 *              - 百度主动推送：每日配额很小（实测 remain≈10/天）→ 只推「最新
 *                切片」（baiduHigh 只上不下，NEWEST-first）；存量发现交给
 *                sitemap 与 IndexNow。谷底策略：每轮一批 5 条，配额耗尽的
 *                400 属预期，日志可见、游标不动、次日配额刷新后自动续推。
 *
 *              口径：SITEMAP_NOTICE_WHERE（ADR-0026 单一事实源，与 sitemap
 *              快照/翻译队列/周报共用，禁止另写 WHERE）。
 *
 *              游标：runtime/seo/push-cursor.json（runtime 不进仓库、部署
 *              不清除）。首运行初始化为当前 MAX(id) 且不推送——存量不烧配额。
 *
 * 用法：cd /root/supply-os && npx tsx --env-file=.env scripts/tools/push-new-notices.mts
 * 环境：BAIDU_PUSH_TOKEN（必填，资源平台-普通收录-推送接口）、SITE_URL（默认线上）
 */
import mysql from "mysql2/promise";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * 口径：与 src/lib/services/seo/indexable.ts 的 SITEMAP_NOTICE_WHERE 保持一致
 * （= ACTIVE_NOTICE_WHERE + PLATFORM_PUBLISHED_ONLY + INDEXABLE_NOTICE_WHERE，
 * 需要 bid_notices n JOIN notice_public p）。
 *
 * 为什么内联而不是 import：服务器 /root/supply-os 只有 standalone 产物与
 * scripts/，没有 src 树（与 seo-count-indexable.mts 内联统计同一约束）。
 * ⚠️ indexable.ts 的口径变更时必须同步本文件——两处的 WHERE 文本应逐字一致。
 */
const SITEMAP_NOTICE_WHERE =
  // ACTIVE_NOTICE_WHERE（src/lib/utils/notice-expired.ts）
  "(n.deadline_sec IS NULL OR n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))" +
  // PLATFORM_PUBLISHED_ONLY（排除平台用户未过审 RFQ）
  " AND (n.entry_source <> 'platform' OR IFNULL(n.rfq_status, '') = 'published')" +
  // INDEXABLE_NOTICE_WHERE（内容门槛：非空白正文 + 中文优先标题≥8 + 正文≥200）
  " AND (p.deadline_ts IS NULL OR p.deadline_ts = 0 OR p.deadline_ts >= UNIX_TIMESTAMP())" +
  " AND p.country_code IS NOT NULL" +
  " AND p.notice_type_code IS NOT NULL" +
  " AND p.content_level <> 'empty'" +
  " AND CHAR_LENGTH(COALESCE(NULLIF(p.title_cn, ''), NULLIF(p.title, ''))) >= 8" +
  " AND CHAR_LENGTH(COALESCE(NULLIF(p.description_cn, ''), NULLIF(p.description, ''))) >= 200";

const SITE = (process.env.SITE_URL ?? "https://osneosmart.com").replace(/\/$/, "");
const HOST = new URL(SITE).host;
const BAIDU_TOKEN = process.env.BAIDU_PUSH_TOKEN;
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "ef66632986ef4b3f937ca56330b837ff";
const CURSOR_PATH = "runtime/seo/push-cursor.json";
const SCAN_LIMIT = 1000; // IndexNow 单轮扫描上限（IndexNow 单次上限 1 万，远够）
const BAIDU_BATCH = 5; // 百度每轮推送数；每日配额 ≈10，两轮用完即止

if (!BAIDU_TOKEN) {
  console.error("[push] 缺少 BAIDU_PUSH_TOKEN（资源平台 → 普通收录 → 推送接口）");
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 1,
  connectTimeout: 10_000,
});

const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

interface Cursor {
  indexnowLastId: number;
  baiduHigh: number;
  updatedAt: string;
}

function readCursor(): Cursor | null {
  if (!existsSync(CURSOR_PATH)) return null;
  try {
    const c = JSON.parse(readFileSync(CURSOR_PATH, "utf8")) as Partial<Cursor>;
    // 兼容旧单游标格式
    if (typeof c.indexnowLastId === "number" && typeof c.baiduHigh === "number") {
      return { indexnowLastId: c.indexnowLastId, baiduHigh: c.baiduHigh, updatedAt: c.updatedAt ?? "" };
    }
    if (typeof (c as { lastId?: number }).lastId === "number") {
      const lastId = (c as { lastId: number }).lastId;
      return { indexnowLastId: lastId, baiduHigh: lastId, updatedAt: c.updatedAt ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

function writeCursor(c: Omit<Cursor, "updatedAt">): void {
  mkdirSync("runtime/seo", { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify({ ...c, updatedAt: new Date().toISOString() }));
}

const toUrls = (ids: number[]) => ids.map((id) => `${SITE}/procurement/notice/${id}`);

async function newIndexableIds(afterId: number, desc: boolean, limit: number): Promise<number[]> {
  const [rows] = await pool.query(
    `SELECT n.id
       FROM bid_notices n
       JOIN notice_public p ON p.notice_pk = n.id
      WHERE n.id > ? AND ${SITEMAP_NOTICE_WHERE}
      ORDER BY n.id ${desc ? "DESC" : "ASC"}
      LIMIT ?`,
    [afterId, limit],
  );
  return (rows as Array<{ id: number }>).map((r) => Number(r.id));
}

/** IndexNow：无配额，全量新公告，失败不阻塞（游标仍前进，下轮补推靠 sitemap 兜底） */
async function pushIndexNow(ids: number[]): Promise<boolean> {
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: toUrls(ids) }),
    });
    const ok = res.status === 200 || res.status === 202;
    log(`IndexNow：HTTP ${res.status}（${ids.length} 条，${ok ? "已受理" : (await res.text()).slice(0, 120)}）`);
    return ok;
  } catch (err) {
    log(`IndexNow 失败（游标仍前进，sitemap 兜底）：${(err as Error).message}`);
    return false;
  }
}

/** 百度：text/plain 逐行 URL。返回 {done, pushed, maxId}；失败游标不动，次日配额刷新续推 */
async function pushBaidu(ids: number[]): Promise<{ done: boolean; pushed: number; maxId: number }> {
  if (ids.length === 0) return { done: true, pushed: 0, maxId: 0 };
  try {
    const res = await fetch(`http://data.zz.baidu.com/urls?site=${SITE}&token=${BAIDU_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: toUrls(ids).join("\n"),
    });
    const text = await res.text();
    if (res.status === 200) {
      const j = JSON.parse(text) as { success?: number; remain?: number };
      log(`百度推送：HTTP 200 success=${j.success ?? 0} remain=${j.remain ?? "?"}（${ids.length} 条）`);
      return { done: true, pushed: ids.length, maxId: Math.max(...ids) };
    }
    log(`百度推送未受理：HTTP ${res.status} ${text.slice(0, 160)}（${ids.length} 条，游标不动，配额刷新后续推）`);
    return { done: false, pushed: 0, maxId: 0 };
  } catch (err) {
    log(`百度推送异常（游标不动）：${(err as Error).message}`);
    return { done: false, pushed: 0, maxId: 0 };
  }
}

async function main(): Promise<void> {
  let cursor = readCursor();
  if (!cursor) {
    const [r] = await pool.query("SELECT COALESCE(MAX(id), 0) AS m FROM bid_notices");
    const maxId = Number((r as Array<{ m: number }>)[0].m);
    writeCursor({ indexnowLastId: maxId, baiduHigh: maxId });
    log(`首次运行：游标初始化为 MAX(id)=${maxId}，不回填存量（存量发现交给 sitemap）`);
    return;
  }

  // ── IndexNow：全量增量 ──
  const inIds = await newIndexableIds(cursor.indexnowLastId, false, SCAN_LIMIT);
  if (inIds.length > 0) {
    await pushIndexNow(inIds);
    cursor.indexnowLastId = Math.max(...inIds);
    writeCursor(cursor);
    log(`IndexNow 游标 → ${cursor.indexnowLastId}`);
  } else {
    log(`IndexNow：无新公告（游标 ${cursor.indexnowLastId}）`);
  }

  // ── 百度：最新切片（baiduHigh 只上不下，配额耗尽即停，次日续推） ──
  const baiduIds = await newIndexableIds(cursor.baiduHigh, true, BAIDU_BATCH);
  if (baiduIds.length === 0) {
    log("百度：无待推切片");
    return;
  }
  const r = await pushBaidu(baiduIds);
  if (r.done && r.pushed > 0) {
    cursor.baiduHigh = r.maxId;
    writeCursor(cursor);
    log(`百度游标 → ${cursor.baiduHigh}（剩余未推存量由 sitemap/IndexNow 兜底）`);
  }
}

main()
  .catch((err) => {
    console.error(`[push] FAIL: ${(err as Error).message}`);
    process.exit(1);
  })
  .finally(() => pool.end());
