/**
 * 增量双语翻译定时任务
 * Incremental bilingual translation scheduler
 *
 * @module server/services/translation/auto
 * @description 公告由 CRM 侧爬虫写入 crm_bid_notices，本项目无插入钩子可挂，
 *   故用每日两次定时触发（北京时间 06:00 / 13:00）补齐新增公告译文。
 *   采用水位线断点续传机制：每次从 crm_translation_state 读取上次成功翻译的
 *   最大公告 ID（cutoff），仅扫描该水位线之后、尚未生成译文的新增记录，
 *   翻译完成后立即更新水位线，避免重复计算 Token 成本。
 *   目标语言由源语言动态决定（zh→en / en→zh / 小语种→zh+en），
 *   复用 translateViaChain（DeepSeek 单通道 + 术语占位符保护）。
 *
 *   [P0] 批量合并：每次取 BATCH_SIZE 条标题按源语言分组后合并为一次 API 调用，
 *        固定 prompt 开销被摊薄，DeepSeek 前缀缓存命中率显著提升。
 *   [P1] 标题去重：同批次内相同标题仅翻译一次，译文复写到所有同标题公告，
 *        避免 "Request for Quotation" 等模板化标题重复消耗 Token。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ChainSourceLang } from "./chain";
import { translateViaChain } from "./chain";
import {
  pendingNoticeTranslations,
  detectSourceLang,
} from "./notice";
import { channelConfigured } from "../../config/env";
import { createLogger } from "../../utils/fileLogger";
import { markTranslationSuccess, flushCleanedLogs } from "./logCleanup";
import { syncWideIds } from "../search-sync/index";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";

const logger = createLogger("auto-translate");

export interface AutoTranslateConfig {
  dbPool: Pool;
  enabled: boolean;
  intervalMs?: number; // @deprecated 调度已改为每日两次定时触发，保留仅为向后兼容
  maxPerRun: number;
  descMaxChars: number;
  dailyCharBudget: number;
}

export function readAutoTranslateConfig(): AutoTranslateConfig {
  return {
    dbPool: null as unknown as Pool, // 由 startAutoTranslate 注入
    enabled: String(process.env.NOTICE_AUTO_TRANSLATE ?? "on").toLowerCase() !== "off",
    maxPerRun: Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 50000),
    descMaxChars: Number(process.env.NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS || 8000),
    dailyCharBudget: Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000),
  };
}

const CONCURRENCY = 10;  // 10 并发 worker（降低并发避免 DeepSeek 429 限流）
const DELAY_MS = 200;   // 每批次间隔 200ms（配合重试机制给 API 喘息时间）
const BATCH_SIZE = 8;   // 每批合并翻译的标题数（≤8 显著降低 BAD_SHAPE 概率）

// 扫描目标白名单：公告表 + 精选数据表（两表 deadline_sec 口径一致）；
// 表名/列名均来自常量，无注入面
const SCAN_TARGETS = [
  { table: "crm_bid_notices", trTable: "crm_notice_translations", idCol: "notice_id" },
  { table: "crm_bid_opportunities", trTable: "crm_opportunity_translations", idCol: "opportunity_id" },
] as const;

// ── 北京时间辅助函数 & 定时调度 ──
// 北京时间 = UTC+8，调度时刻：每天 06:00 和 13:00（对应 UTC 22:00 和 05:00）

/** 获取当前北京时间的小时和分钟 */
function getBeijingHM(): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return {
    h: Number(parts.find((p) => p.type === "hour")!.value),
    m: Number(parts.find((p) => p.type === "minute")!.value),
  };
}

/**
 * 计算下一个触发时刻（北京时间 06:00 或 13:00）
 * 规则：
 *   - 当前 < 06:00 → 今天 06:00
 *   - 06:00 ≤ 当前 < 13:00 → 今天 13:00
 *   - 当前 ≥ 13:00 → 明天 06:00
 */
function nextBeijingTrigger(): Date {
  const now = new Date();
  const { h, m } = getBeijingHM();
  const curMin = h * 60 + m;

  let targetMin: number;
  let dayOffset: number;
  if (curMin < 6 * 60) {
    targetMin = 6 * 60;    // 06:00
    dayOffset = 0;
  } else if (curMin < 13 * 60) {
    targetMin = 13 * 60;   // 13:00
    dayOffset = 0;
  } else {
    targetMin = 6 * 60;    // 次日 06:00
    dayOffset = 1;
  }

  // 构造北京时间的目标时刻，再转回 UTC Date
  const bjStr = new Date(now.getTime() + dayOffset * 86400000)
    .toISOString().slice(0, 10);  // 目标日 UTC 日期字符串
  const targetUtc = new Date(`${bjStr}T${String(Math.floor(targetMin / 60)).padStart(2, "0")}:${String(targetMin % 60).padStart(2, "0")}:00Z`);
  // 调整到正确的 UTC 时间（北京时间 = UTC + 8h）
  targetUtc.setTime(targetUtc.getTime() - 8 * 3600000);
  return targetUtc;
}


export async function runIncrementalTranslation(
  dbPool: Pool,
  cfg: { maxPerRun: number; descMaxChars: number; dailyCharBudget: number },
): Promise<{ ok: number; failed: number; charsUsed: number }> {
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
    "SELECT state_key, state_value FROM crm_translation_state WHERE state_key IN (?, ?)",
    ["budget_day", "budget_chars_used"]
  );
  const stateMap = new Map<string, string>();
  for (const row of stateRows as RowDataPacket[]) stateMap.set(row.state_key, String(row.state_value || ""));
  const budgetDay = stateMap.get("budget_day") || "";
  if (budgetDay === today) {
    const used = Number(stateMap.get("budget_chars_used") || "0");
    if (used >= cfg.dailyCharBudget) {
      console.warn(`[auto-translate] 日预算已耗尽 (${used}/${cfg.dailyCharBudget})，本轮跳过`);
      return { ok: 0, failed: 0, charsUsed: used };
    }
    charsUsed = used;
  }

  // P1 性能优化：使用生成列 deadline_sec 替代表达式，使 WHERE 可走索引
  // 统一过期口径：仅依赖 deadline_sec 实时判断，不再使用 is_expired 字段
  const activeCondition = ACTIVE_NOTICE_WHERE;

  // ── 跨轮次标题去重缓存（P1）：同一 run 内跨 target/lang 共享，已翻译标题不再调用 API ──
  const dedupCache = new Map<string, { titleTr: string; provider: string }>();

  for (const target of SCAN_TARGETS) {
    for (const targetLang of ["zh", "en"] as const) {
      if (charsUsed >= cfg.dailyCharBudget) break;
      // 不再使用固定水位线，每次从最小未翻译 ID 开始扫描，自然覆盖所有空洞
      const sqlLimit = targetLang === "en" ? cfg.maxPerRun * 3 : cfg.maxPerRun;
      const [rows] = await dbPool.query(
        `SELECT n.id, n.title, n.description, n.reference,
                t.title_tr AS cached_title_tr,
                t.description_tr AS cached_desc_tr,
                t.model AS cached_model
         FROM ${target.table} n
         LEFT JOIN ${target.trTable} t ON t.${target.idCol} = n.id AND t.lang = ?
        WHERE ${activeCondition}
          AND (
            t.id IS NULL
            OR (
              (t.title_tr IS NULL OR t.title_tr = '')
              AND (t.model IS NULL OR t.model NOT IN ('skip-same-lang'))
            )
          )
          AND n.title IS NOT NULL AND TRIM(n.title) <> ''
        ORDER BY n.id ASC
        LIMIT ?`,
        [targetLang, sqlLimit]
      );
      // BUG-I1 修复：使用与 notice-translation.ts 一致的 key 格式，避免竞态重复翻译
      const pendingPrefix = target.table === "crm_bid_notices" ? "notice" : "opportunity";
      let queue = (rows as RowDataPacket[]).filter(
        (row) => !pendingNoticeTranslations.has(`${pendingPrefix}:${row.id}:${targetLang}`)
      );

      // ── 同语言预过滤（仅 en 扫描生效）──
      // 英文原文记录不需要翻译为英文，立即写 skip-same-lang 标记，
      // 避免它们反复占据 LIMIT 配额、挤掉真正需要翻译的小语种记录。
      if (targetLang === "en" && queue.length > 0) {
        const needTranslate: any[] = [];
        for (const row of queue) {
          const title = String(row.title || "").trim();
          const description = String(row.description || "").trim();
          const hasCache = !!String(row.cached_title_tr || "").trim() || !!String(row.cached_desc_tr || "").trim();
          const srcLang = detectSourceLang(title, description);
          if (srcLang === "en") {
            if (!hasCache) await writeSkipMarker(target, row.id, targetLang);
          } else {
            needTranslate.push(row);
          }
        }
        queue = needTranslate.slice(0, cfg.maxPerRun);
      }

      if (queue.length === 0) continue;

      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (queue.length) {
            if (charsUsed >= cfg.dailyCharBudget) break;

            // ── Phase 1: 收集一批条目，本地检测源语言（零 API 开销）──
            const batchItems: {
              row: RowDataPacket;
              title: string;
              description: string;
              reference: string;
              hasExistingCache: boolean;
              sourceLang: ChainSourceLang;
            }[] = [];

            while (batchItems.length < BATCH_SIZE && queue.length > 0) {
              if (charsUsed >= cfg.dailyCharBudget) break;
              const row = queue.shift();
              if (!row) break;
              const title = String(row.title || "").trim();
              const description = String(row.description || "").trim();
              const srcLang = detectSourceLang(title, description);
              if (!srcLang) {
                const cachedTitleTr = String(row.cached_title_tr || "").trim();
                const cachedDescTr = String(row.cached_desc_tr || "").trim();
                if (!cachedTitleTr && !cachedDescTr) await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              if (srcLang === targetLang) {
                const cachedTitleTr = String(row.cached_title_tr || "").trim();
                const cachedDescTr = String(row.cached_desc_tr || "").trim();
                if (!cachedTitleTr && !cachedDescTr) await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              batchItems.push({
                row,
                title,
                description,
                reference: String(row.reference || "").trim(),
                hasExistingCache: !!(String(row.cached_title_tr || "").trim() || String(row.cached_desc_tr || "").trim()),
                sourceLang: srcLang as ChainSourceLang,
              });
            }

            if (batchItems.length === 0) break;

            // ── Phase 2: 按源语言分组 + 标题去重 ──
            const groups = new Map<string, typeof batchItems>();
            for (const item of batchItems) {
              const key = item.sourceLang;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(item);
            }

            for (const [srcLang, items] of groups) {
              if (charsUsed >= cfg.dailyCharBudget) break;

              // 标题去重：相同标题只翻译一次，译文复用到所有同标题公告
              const titleToItems = new Map<string, typeof items>();
              for (const item of items) {
                if (!titleToItems.has(item.title)) titleToItems.set(item.title, []);
                titleToItems.get(item.title)!.push(item);
              }

              const uniqueTitles: string[] = [];
              const dedupEntries: { title: string; cached: { titleTr: string; provider: string } }[] = [];
              for (const [title, titleItems] of titleToItems) {
                const cached = dedupCache.get(title);
                if (cached) {
                  dedupEntries.push({ title, cached });
                } else {
                  uniqueTitles.push(title);
                }
              }

              // 批量翻译未命中的唯一标题（一次 API 调用翻译多条）
              const translatedMap = new Map<string, { titleTr: string; provider: string }>();
              if (uniqueTitles.length > 0) {
                try {
                  const result = await translateViaChain(
                    uniqueTitles,
                    srcLang as ChainSourceLang,
                    targetLang,
                  );
                  for (let i = 0; i < uniqueTitles.length; i++) {
                    const titleTr = String(result.translations[i] || "").trim();
                    translatedMap.set(uniqueTitles[i], { titleTr, provider: result.provider });
                    dedupCache.set(uniqueTitles[i], { titleTr, provider: result.provider });
                    charsUsed += uniqueTitles[i].length;
                  }
                } catch (batchErr: any) {
                  const errMsg = batchErr?.message || String(batchErr);
                  const degraded = (batchErr?.degradedFrom as string[] | undefined)?.join(" → ") || "-";

                  // ── 批量失败降级：逐条单独重试（单条 API 调用格式稳定性远高于批量）──
                  for (const [title, titleItems] of titleToItems) {
                    let recovered = false;
                    try {
                      const singleResult = await translateViaChain(
                        [title],
                        srcLang as ChainSourceLang,
                        targetLang,
                      );
                      const titleTr = String(singleResult.translations[0] || "").trim();
                      if (titleTr) {
                        translatedMap.set(title, { titleTr, provider: singleResult.provider });
                        dedupCache.set(title, { titleTr, provider: singleResult.provider });
                        charsUsed += title.length;
                        recovered = true;
                      }
                    } catch { /* 单条也失败，走下方 FAIL 日志 */ }

                    if (!recovered) {
                      for (const item of titleItems) {
                        failed += 1;
                        const titlePreview = item.title.length > 80 ? item.title.slice(0, 80) + "..." : item.title;
                        logger.warn(
                          `table=${target.table} id=${item.row.id} lang=${targetLang} FAIL | sourceLang=${srcLang} error="${errMsg}" degraded="${degraded}" title="${titlePreview}"`
                        );
                      }
                    }
                  }
                  continue;
                }
              }

              // ── Phase 3: 写库（翻译结果 + 去重缓存命中）──
              const allResults = new Map<string, { titleTr: string; provider: string }>();
              for (const [title, result] of translatedMap) allResults.set(title, result);
              for (const { title, cached } of dedupEntries) allResults.set(title, cached);

              for (const [title, { titleTr, provider }] of allResults) {
                const titleItems = titleToItems.get(title)!;
                for (const item of titleItems) {
                  try {
                    await dbPool.query(
                      `INSERT INTO ${target.trTable} (${target.idCol}, lang, title_tr, description_tr, model)
                       VALUES (?, ?, ?, NULL, ?)
                       ON DUPLICATE KEY UPDATE
                         title_tr = COALESCE(VALUES(title_tr), title_tr),
                         model = VALUES(model)`,
                      [item.row.id, targetLang, titleTr || null, provider]
                    );
                    // 通过统一路径同步宽表（宽表写入单一路径：syncWideIds）
                    if (target.table === "crm_bid_notices" && titleTr) {
                      void syncWideIds(dbPool, [item.row.id]).catch(() => {});
                    }
                    ok += 1;
                    markTranslationSuccess(target.table, item.row.id, targetLang);
                  } catch (writeErr: any) {
                    failed += 1;
                    logger.warn(`table=${target.table} id=${item.row.id} WRITE_FAIL error="${writeErr?.message || writeErr}"`);
                  }
                }
              }
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

  // 异步刷盘：将本轮成功翻译的失败日志行从文件中移除（非阻塞）
  void flushCleanedLogs().catch((err) => {
    console.warn(`[auto-translate] 日志清理失败（静默忽略）: ${err?.message || err}`);
  });

  return { ok, failed, charsUsed };
}

/**
 * DeepSeek 通道健康检查：启动时发送短文本探测，确认 API Key 有效且可达。
 * 失败时输出醒目警告但不阻断调度（可能只是临时故障，后续轮次会重试）。
 */
async function probeDeepSeekHealth(): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!channelConfigured(apiKey)) {
    console.warn("[auto-translate] ⚠ DeepSeek API Key 未配置，翻译链将仅依赖 Gemini 兜底（当前也未配置）");
    return;
  }
  try {
    await translateViaChain(["Hello"], "en", "zh");
  } catch (err: any) {
    const degraded = (err?.degradedFrom as string[] | undefined)?.join(" → ") || err?.message || String(err);
    console.error(`[auto-translate] ✗ DeepSeek 健康检查失败: ${degraded}。翻译任务将继续尝试但可能持续失败，请检查 API Key 与网络。`);
  }
}

/**
 * 启动定时调度：每日北京时间 06:00 和 13:00 各触发一次。
 * 启动时先做健康检查，再计算最近一个触发时刻。
 * 返回 stop 函数供优雅关闭使用。
 */
export function startAutoTranslate(
  dbPool: Pool,
  cfg: { enabled: boolean; intervalMs?: number; maxPerRun: number; descMaxChars: number; dailyCharBudget: number },
): () => void {
  if (!cfg.enabled) {
    return () => {};
  }

  let running = false;
  let nextTimer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runIncrementalTranslation(dbPool, cfg);
    } catch (err: any) {
      logger.warn(`SCAN_FAIL error="${err?.message || err}"`);
    } finally {
      running = false;
      scheduleNext();
    }
  };

  /** 递归调度：计算下一个触发时刻并设置单次 setTimeout。
   *  仅在定时触发点执行，超过触发时刻则跳过等待下一轮。 */
  function scheduleNext() {
    const next = nextBeijingTrigger();
    const delayMs = Math.max(0, next.getTime() - Date.now());
    nextTimer = setTimeout(() => void tick(), delayMs);
  }

  // 启动时先做健康检查，再调度首次运行
  void probeDeepSeekHealth();
  console.log("[auto-translate] 定时翻译已启用: 每日北京时间 06:00 / 13:00");
  scheduleNext();

  return () => {
    if (nextTimer) clearTimeout(nextTimer);
  };
}
