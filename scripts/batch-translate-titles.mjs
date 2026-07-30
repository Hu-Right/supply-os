/**
 * 批量翻译脚本：将所有未过期、未翻译公告标题通过有道大模型翻译为中文
 * 用法：node scripts/batch-translate-titles.mjs
 * 
 * 特性：
 * - 分批查询（每批 2000 条），避免一次加载全量到内存
 * - 5 并发 + 200ms 间隔控速（有道 QPS=10，留余量）
 * - 失败自动重试 1 次（间隔 2 秒）
 * - 实时进度输出 + 每 100 条打印进度百分比
 * - 超长标题（>5000字符）自动跳过
 */
import mysql from "mysql2/promise";
import crypto from "crypto";

// ─── 配置 ───────────────────────────────────────────────────────
const YOUDAO_APP_KEY = "428095eca7dd3186";
const YOUDAO_APP_SECRET = "aBE1v3eUR6g2su3GtEEiZesFq1xrOWpC";
const YOUDAO_LLM_ENDPOINT = "https://openapi.youdao.com/proxy/http/llm-trans";
const YOUDAO_LLM_MODEL = "0"; // 0=子曰Pro(14B)
const PAGE_SIZE = 2000;   // 每批查询数量
const CONCURRENCY = 5;    // 并发数（有道 QPS=10，留余量）
const DELAY_MS = 200;     // 每次请求间隔（控速）
const RETRY_COUNT = 1;    // 失败重试次数
const RETRY_DELAY = 2000; // 重试间隔(ms)

const DB_CONFIG = {
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 5,
};

// ─── 有道签名 ───────────────────────────────────────────────────
function youdaoInput(q) {
  if (q.length <= 20) return q;
  return q.slice(0, 10) + q.length + q.slice(q.length - 10);
}

function buildSign(text, salt, curtime) {
  return crypto
    .createHash("sha256")
    .update(YOUDAO_APP_KEY + youdaoInput(text) + salt + curtime + YOUDAO_APP_SECRET)
    .digest("hex");
}

// ─── 有道大模型翻译单条 ─────────────────────────────────────────
async function translateTitle(text) {
  if (!text || !text.trim()) return null;
  if (text.length > 5000) return null; // 超长跳过

  const salt = crypto.randomUUID();
  const curtime = String(Math.round(Date.now() / 1000));
  const sign = buildSign(text, salt, curtime);

  const body = new URLSearchParams({
    appKey: YOUDAO_APP_KEY,
    salt,
    curtime,
    sign,
    signType: "v3",
    i: text,
    from: "en",
    to: "zh-CHS",
    streamType: "full",
    handleOption: YOUDAO_LLM_MODEL,
  });

  const res = await fetch(YOUDAO_LLM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  const responseText = await res.text();
  const lines = responseText.split("\n").filter((l) => l.trim());
  let finalTranslation = "";

  for (const rawLine of lines) {
    const line = rawLine.startsWith("data:") ? rawLine.slice(5).trim() : rawLine.trim();
    if (!line || line === "[DONE]") continue;
    try {
      const parsed = JSON.parse(line);
      if (String(parsed.code) !== "0" || !parsed.successful) {
        throw new Error(`YOUDAO_ERROR_${parsed.code}: ${parsed.message || ""}`);
      }
      if (parsed.data?.transFull) finalTranslation = parsed.data.transFull;
    } catch (e) {
      if (e.message?.startsWith("YOUDAO_ERROR")) throw e;
      // SSE 杂行跳过
    }
  }

  return finalTranslation.trim() || null;
}

// ─── 延时 ───────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 带重试的翻译 ───────────────────────────────────────────────
async function translateTitleWithRetry(text) {
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      return await translateTitle(text);
    } catch (err) {
      if (attempt < RETRY_COUNT) {
        await sleep(RETRY_DELAY);
        continue;
      }
      throw err;
    }
  }
}

// ─── 主流程 ─────────────────────────────────────────────────────
async function main() {
  const pool = mysql.createPool(DB_CONFIG);
  const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
  const startTime = Date.now();

  // 1. 先查询总量
  const [countResult] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM crm_bid_notices n
    LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
    WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
      AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
      AND t.id IS NULL
      AND n.title IS NOT NULL AND TRIM(n.title) <> ''
  `);
  const totalCount = countResult[0].total;
  console.log(`[batch] 待翻译公告总数: ${totalCount}`);
  if (!totalCount) {
    console.log("[batch] 无待翻译数据，退出");
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let processed = 0;
  let lastMaxId = 2147483647; // 从最大开始，逐批向下

  // 2. 分批查询 + 翻译
  while (true) {
    const [rows] = await pool.query(`
      SELECT n.id, n.title
      FROM crm_bid_notices n
      LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
      WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
        AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
        AND t.id IS NULL
        AND n.title IS NOT NULL AND TRIM(n.title) <> ''
        AND n.id < ?
      ORDER BY n.id DESC
      LIMIT ?
    `, [lastMaxId, PAGE_SIZE]);

    if (!rows.length) break;
    lastMaxId = rows[rows.length - 1].id;
    console.log(`\n[batch] 本批 ${rows.length} 条 (id ${rows[0].id} ~ ${rows[rows.length - 1].id})`);

    // 并发处理本批
    const queue = [...rows];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const row = queue.shift();
        if (!row) break;

        try {
          const translated = await translateTitleWithRetry(row.title);
          if (!translated) {
            skipped++;
            continue;
          }

          await pool.query(
            `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
             VALUES (?, 'zh', ?, NULL, 'youdao-llm-pro')
             ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), model = VALUES(model)`,
            [row.id, translated]
          );
          success++;
        } catch (err) {
          failed++;
          console.error(`  FAIL id=${row.id}: ${err.message}`);
        }

        processed++;
        // 每 100 条输出进度
        if (processed % 100 === 0) {
          const pct = ((processed / totalCount) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
          const eta = ((totalCount - processed) / rate).toFixed(0);
          console.log(`  [进度] ${processed}/${totalCount} (${pct}%) | 成功:${success} 失败:${failed} 跳过:${skipped} | ${rate}条/s | 已用:${elapsed}s 预计剩余:${eta}s`);
        }

        await sleep(DELAY_MS);
      }
    });

    await Promise.all(workers);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n[batch] ✅ 全部完成！`);
  console.log(`  成功: ${success}, 失败: ${failed}, 跳过: ${skipped}, 总处理: ${processed}`);
  console.log(`  总耗时: ${totalTime} 分钟`);

  // 3. 验证写入
  const [verify] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM crm_notice_translations WHERE lang = 'zh' AND title_tr IS NOT NULL"
  );
  console.log(`  缓存表当前中文标题总数: ${verify[0].cnt}`);

  await pool.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
