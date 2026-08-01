/**
 * 增量双语翻译定时任务
 * Incremental bilingual translation scheduler
 *
 * @module server/services/autoTranslate
 * @description 公告由 CRM 侧爬虫写入 crm_bid_notices，本项目无插入钩子可挂，
 *   故用准实时轮询补齐：每轮对公告表与精选数据表（SCAN_TARGETS）分别扫描
 *   「未过期 + 水位以上 + 缺译文行」的最新数据，翻译标题+描述，
 *   目标语言由源语言动态决定（zh→en / en→zh / 小语种→zh+en），
 *   复用 translateNoticeViaChain（有道→DeepSeek→Gemini 三层降级 + 术语占位符保护）。
 */
import type { Pool } from "mysql2/promise";
import {
  pendingNoticeTranslations,
  translateNoticeViaChain,
  detectSourceLang,
} from "./notice-translation";

export interface AutoTranslateConfig {
  dbPool: Pool;
  enabled: boolean;
  intervalMs: number;
  maxPerRun: number;
  descMaxChars: number;
  dailyCharBudget: number;
}

export function readAutoTranslateConfig(): AutoTranslateConfig {
  return {
    dbPool: null as unknown as Pool, // 由 startAutoTranslate 注入
    enabled: String(process.env.NOTICE_AUTO_TRANSLATE ?? "on").toLowerCase() !== "off",
    intervalMs: Number(process.env.NOTICE_AUTO_TRANSLATE_INTERVAL_MS || 10 * 60 * 1000),
    maxPerRun: Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 300),
    descMaxChars: Number(process.env.NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS || 8000),
    dailyCharBudget: Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000),
  };
}

const CONCURRENCY = 2; // 2 worker × 4 req/s = 8 QPS < 有道 10，为前台按需翻译留余量
const DELAY_MS = 250;

// 扫描目标白名单：公告表 + 精选数据表（两表 is_expired/deadline_ts 列名一致）；
// 表名/列名均来自常量，无注入面
const SCAN_TARGETS = [
  { table: "crm_bid_notices", trTable: "crm_notice_translations", idCol: "notice_id", cutoffKey: "notice_id_cutoff" },
  { table: "crm_bid_opportunities", trTable: "crm_opportunity_translations", idCol: "opportunity_id", cutoffKey: "opportunity_id_cutoff" },
] as const;

export async function runIncrementalTranslation(
  dbPool: Pool,
  cfg: { maxPerRun: number; descMaxChars: number; dailyCharBudget: number },
): Promise<{ ok: number; failed: number; charsUsed: number }> {
  const startedAt = Date.now();
  let ok = 0;
  let failed = 0;
  let charsUsed = 0;

  // same-lang 标记行：title_tr/description_tr 均 NULL，仅阻断定时扫描重复命中
  async function writeSkipMarker(target: (typeof SCAN_TARGETS)[number], rowId: number, lang: string) {
    await dbPool.query(
      `INSERT INTO ${target.trTable} (${target.idCol}, lang, title_tr, description_tr, model)
       VALUES (?, ?, NULL, NULL, 'skip-same-lang')
       ON DUPLICATE KEY UPDATE model = VALUES(model)`,
      [rowId, lang]
    );
  }

  // ── 预算检查：同日已耗尽则跳过本轮 ──
  const today = new Date().toISOString().slice(0, 10);
  const [stateRows] = await dbPool.query(
    "SELECT state_key, state_value FROM crm_translation_state WHERE state_key IN (?, ?, ?, ?)",
    ["notice_id_cutoff", "opportunity_id_cutoff", "budget_day", "budget_chars_used"]
  );
  const stateMap = new Map<string, string>();
  for (const row of stateRows as any[]) stateMap.set(row.state_key, String(row.state_value || ""));
  const budgetDay = stateMap.get("budget_day") || "";
  if (budgetDay === today) {
    const used = Number(stateMap.get("budget_chars_used") || "0");
    if (used >= cfg.dailyCharBudget) {
      console.warn(`[auto-translate] 日预算已耗尽 (${used}/${cfg.dailyCharBudget})，本轮跳过`);
      return { ok: 0, failed: 0, charsUsed: used };
    }
    charsUsed = used;
  }

  const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";

  for (const target of SCAN_TARGETS) {
    const cutoffId = Number(stateMap.get(target.cutoffKey) || "0");
    for (const targetLang of ["zh", "en"] as const) {
      if (charsUsed >= cfg.dailyCharBudget) break;
      const [rows] = await dbPool.query(
        `SELECT n.id, n.title, n.description
         FROM ${target.table} n
         LEFT JOIN ${target.trTable} t ON t.${target.idCol} = n.id AND t.lang = ?
        WHERE n.id > ?
          AND (n.is_expired = 0 OR n.is_expired IS NULL)
          AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
          AND t.id IS NULL
          AND n.title IS NOT NULL AND TRIM(n.title) <> ''
        ORDER BY n.id DESC
        LIMIT ?`,
        [targetLang, cutoffId, cfg.maxPerRun]
      );
      const queue = (rows as any[]).filter(
        (row) => !pendingNoticeTranslations.has(`${target.idCol}:${row.id}:${targetLang}`)
      );
      if (queue.length === 0) continue;

      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (queue.length) {
            if (charsUsed >= cfg.dailyCharBudget) break;
            const row = queue.shift();
            if (!row) break;
            const title = String(row.title || "").trim();
            const description = String(row.description || "").trim();
            try {
              const sourceLang = detectSourceLang(title, description);
              // 源语言未知/同语言：写标记行让 t.id IS NULL 扫描条件跳过，杜绝逐轮重扫；
              // title_tr 置 NULL，用户按需查看时详情端点仍会全量重译
              if (!sourceLang || sourceLang === targetLang) {
                await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              if (charsUsed >= cfg.dailyCharBudget) break;

              // 标题+描述一起翻译（一次调用，术语一致性更好）
              const result = await translateNoticeViaChain(title, description, targetLang);
              const titleTr = String(result.translations[0] || "").trim();
              const descTr = String(result.translations[1] || "").trim();

              if (result.provider === "same-lang-passthrough") {
                await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              charsUsed += title.length + description.length;

              await dbPool.query(
                `INSERT INTO ${target.trTable} (${target.idCol}, lang, title_tr, description_tr, model)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   title_tr = VALUES(title_tr),
                   description_tr = VALUES(description_tr),
                   model = VALUES(model)`,
                [row.id, targetLang, titleTr || null, descTr || null, result.provider]
              );
              ok += 1;
            } catch (err: any) {
              failed += 1;
              // 单条失败不阻断本轮，但留告警定位具体记录与语言
              console.warn(
                `[translate] auto-translate failed table=${target.table} id=${row.id} lang=${targetLang}: ${err?.message}`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          }
        })
      );
    }
  }

  await dbPool.query(
    `INSERT INTO crm_translation_state (state_key, state_value)
     VALUES (?, ?), (?, ?)
     ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)`,
    ["budget_day", today, "budget_chars_used", String(charsUsed)]
  );
  console.log(
    `[auto-translate] 增量双语翻译: 成功 ${ok} 失败 ${failed} 字符 ${charsUsed}/${cfg.dailyCharBudget} 耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`
  );
  return { ok, failed, charsUsed };
}

/**
 * 启动定时调度：30s 后跑首轮，随后每 intervalMs 一轮。
 * 返回 stop 函数供优雅关闭使用。
 */
export function startAutoTranslate(
  dbPool: Pool,
  cfg: { enabled: boolean; intervalMs: number; maxPerRun: number; descMaxChars: number; dailyCharBudget: number },
): () => void {
  if (!cfg.enabled) {
    console.log("[auto-translate] 已禁用（NOTICE_AUTO_TRANSLATE=off）");
    return () => {};
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runIncrementalTranslation(dbPool, cfg);
    } catch (err: any) {
      console.warn("[auto-translate] 本轮扫描失败:", err?.message || err);
    } finally {
      running = false;
    }
  };

  const timer1 = setTimeout(() => void tick(), 30_000);
  const timer2 = setInterval(() => void tick(), cfg.intervalMs);
  console.log(
    `[auto-translate] 已启用: 每 ${Math.round(cfg.intervalMs / 60000)} 分钟扫描新增公告（水位以上），单轮上限 ${cfg.maxPerRun} 条/语言，双语（zh+en），日预算 ${cfg.dailyCharBudget} 字符`
  );

  return () => {
    clearTimeout(timer1);
    clearInterval(timer2);
  };
}
