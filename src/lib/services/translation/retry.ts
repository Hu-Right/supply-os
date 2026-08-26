/**
 * 批量翻译重试服务
 * Batch translation retry for previously failed notices
 *
 * @module server/services/translation/retry
 * @description 扫描翻译表中缺失/空译文的记录（含已过期公告），重新走翻译链。
 *   与 autoTranslate.ts 的区别：
 *   - autoTranslate 仅扫描 id > cutoffId 且未过期的新增记录；
 *   - 本服务专门针对历史失败记录（id < cutoffId 或已过期），不受水位线限制。
 *   通过 admin API 手动触发，避免与定时任务争抢 API 配额。
 *
 *   [P0] 批量合并：与 auto.ts 同源，每次取 BATCH_SIZE 条标题按源语言分组后合并为一次 API 调用。
 *   [P1] 标题去重：同一次 run 内跨 target/lang 共享去重缓存，相同标题仅翻译一次。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ChainSourceLang } from "./chain";
import { translateViaChain } from "./chain";
import {
  pendingNoticeTranslations,
  detectSourceLang,
} from "./notice";
import { createLogger } from "../../utils/fileLogger";
import { markTranslationSuccess, flushCleanedLogs } from "./logCleanup";
import { syncWideIds } from "../search-sync/index";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";

const logger = createLogger("retry-translate");

const BATCH_SIZE = 8; // 每批合并翻译的标题数（与 auto.ts 保持一致）

// ── 扫描目标：与 autoTranslate.ts 保持一致 ──
const SCAN_TARGETS = [
  { table: "crm_bid_notices", trTable: "crm_notice_translations", idCol: "notice_id" },
  { table: "crm_bid_opportunities", trTable: "crm_opportunity_translations", idCol: "opportunity_id" },
] as const;

export interface RetryOptions {
  /** 单次运行最大处理条数（每张表/每语言），默认 500 */
  maxPerScan?: number;
  /** 是否包含已过期公告，默认 true（重试场景需要覆盖过期记录） */
  includeExpired?: boolean;
  /** 并发数，默认 10（低于 autoTranslate 的 20，减少 API 压力） */
  concurrency?: number;
  /** 每条间隔毫秒，默认 300（给 API 更多喘息时间） */
  delayMs?: number;
  /** 日字符预算上限（与 autoTranslate 共享 crm_translation_state 预算）；不传则不检查预算 */
  dailyCharBudget?: number;
}

export interface RetryResult {
  scanned: number;
  ok: number;
  failed: number;
  skipped: number;
  charsUsed: number;
  durationMs: number;
  details: {
    table: string;
    lang: string;
    scanned: number;
    ok: number;
    failed: number;
    skipped: number;
  }[];
}

// ── 运行状态追踪（防止并发触发）──
let isRunning = false;
let lastResult: RetryResult | null = null;

/** 获取最近一次重试结果 */
export function getLastRetryResult(): RetryResult | null {
  return lastResult;
}

/** 是否正在运行 */
export function isRetryRunning(): boolean {
  return isRunning;
}

/**
 * 执行批量翻译重试
 * 可通过 admin API 触发，也可在代码中直接调用。
 * 与增量翻译不同：忽略 cutoffId 与过期限制，专门拾取历史失败记录。
 */
export async function runRetryTranslation(
  dbPool: Pool,
  opts: RetryOptions = {},
): Promise<RetryResult> {
  if (isRunning) {
    throw new Error("RETRY_ALREADY_RUNNING");
  }
  isRunning = true;
  const startedAt = Date.now();

  const maxPerScan = opts.maxPerScan ?? 500;
  const includeExpired = opts.includeExpired ?? true;
  const concurrency = opts.concurrency ?? 10;
  const delayMs = opts.delayMs ?? 300;
  const dailyCharBudget = opts.dailyCharBudget ?? 0; // 0 = 不限制

  const result: RetryResult = {
    scanned: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
    charsUsed: 0,
    durationMs: 0,
    details: [],
  };

  // ── 日预算检查：与 autoTranslate 共享 crm_translation_state 预算 ──
  // 重试场景可能消耗大量 API 配额，若调用方传入了 dailyCharBudget 则尊重全局预算
  let charsUsedToday = 0;
  if (dailyCharBudget > 0) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [stateRows] = await dbPool.query(
        "SELECT state_key, state_value FROM crm_translation_state WHERE state_key IN (?, ?)",
        ["budget_day", "budget_chars_used"]
      );
      const stateMap = new Map<string, string>();
      for (const row of stateRows as RowDataPacket[]) stateMap.set(row.state_key, String(row.state_value || ""));
      const budgetDay = stateMap.get("budget_day") || "";
      if (budgetDay === today) {
        charsUsedToday = Number(stateMap.get("budget_chars_used") || "0");
        if (charsUsedToday >= dailyCharBudget) {
          console.warn(`[retry-translate] 日预算已耗尽 (${charsUsedToday}/${dailyCharBudget})，本轮跳过`);
          logger.warn(`BUDGET_EXHAUSTED used=${charsUsedToday} budget=${dailyCharBudget}`);
          result.charsUsed = charsUsedToday;
          isRunning = false;
          lastResult = result;
          return result;
        }
      }
    } catch (err: any) {
      console.warn(`[retry-translate] 预算状态读取失败（静默跳过预算检查）: ${err?.message || err}`);
    }
  }

  console.log(`[retry-translate] ── 开始批量重试扫描 ── (includeExpired=${includeExpired}, maxPerScan=${maxPerScan}, concurrency=${concurrency}${dailyCharBudget > 0 ? `, dailyCharBudget=${dailyCharBudget}, charsUsedToday=${charsUsedToday}` : ""})`);
  logger.info(`START includeExpired=${includeExpired} maxPerScan=${maxPerScan} concurrency=${concurrency}${dailyCharBudget > 0 ? ` dailyCharBudget=${dailyCharBudget} charsUsedToday=${charsUsedToday}` : ""}`);

  try {
    for (const target of SCAN_TARGETS) {
      for (const targetLang of ["zh", "en"] as const) {
        // 日预算耗尽时跳过后续表/语言
        if (dailyCharBudget > 0 && result.charsUsed + charsUsedToday >= dailyCharBudget) {
          console.log(`[retry-translate] 日预算耗尽，跳过 ${target.table} lang=${targetLang}`);
          continue;
        }
        const detail = { table: target.table, lang: targetLang, scanned: 0, ok: 0, failed: 0, skipped: 0 };

        // ── 查询缺失译文的记录 ──
        // 条件：翻译行不存在 OR (title_tr 为空 AND model 非 skip-same-lang)
        // 与 autoTranslate 的区别：不加 cutoffId 限制，不加过期限制（可选）
        const expiredCondition = includeExpired
          ? "1=1" // 不过滤过期
          : ACTIVE_NOTICE_WHERE;

        const [rows] = await dbPool.query(
          `SELECT n.id, n.title, n.description, n.reference
           FROM ${target.table} n
           LEFT JOIN ${target.trTable} t ON t.${target.idCol} = n.id AND t.lang = ?
           WHERE ${expiredCondition}
             AND (
               t.id IS NULL
               OR (
                 (t.title_tr IS NULL OR t.title_tr = '')
                 AND (t.model IS NULL OR t.model NOT IN ('skip-same-lang'))
               )
             )
             AND n.title IS NOT NULL AND TRIM(n.title) <> ''
           ORDER BY n.id DESC
           LIMIT ?`,
          [targetLang, maxPerScan]
        );

        const allRows = rows as RowDataPacket[];
        if (allRows.length === 0) {
          console.log(`[retry-translate] ${target.table} lang=${targetLang} 无待重试记录`);
          continue;
        }

        // 过滤掉已在内存 pending 中的记录（避免与正在进行的翻译冲突）
        const pendingPrefix = target.table === "crm_bid_notices" ? "notice" : "opportunity";
        const queue = allRows.filter(
          (row) => !pendingNoticeTranslations.has(`${pendingPrefix}:${row.id}:${targetLang}`)
        );

        detail.scanned = queue.length;
        result.scanned += queue.length;
        console.log(`[retry-translate] ${target.table} lang=${targetLang} 待重试 ${queue.length} 条（原始 ${allRows.length} 条）`);

        if (queue.length === 0) {
          result.details.push(detail);
          continue;
        }

        let processedCount = 0;
        const totalInQueue = queue.length;

        // ── 标题去重缓存：同一 run 内跨 target/lang 共享（与 auto.ts 归一化）──
        const dedupCache = new Map<string, { titleTr: string; provider: string }>();

        // ── 并发处理（批量合并 + 标题去重）──
        await Promise.all(
          Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (queue.length) {
              if (dailyCharBudget > 0 && result.charsUsed + charsUsedToday >= dailyCharBudget) {
                console.log(`[retry-translate] 日预算已达上限 (${result.charsUsed + charsUsedToday}/${dailyCharBudget})，停止处理`);
                break;
              }

              // ── Phase 1: 收集一批条目，本地检测源语言（零 API 开销）──
              const batchItems: {
                row: RowDataPacket;
                title: string;
                description: string;
                sourceLang: ChainSourceLang;
              }[] = [];

              while (batchItems.length < BATCH_SIZE && queue.length > 0) {
                if (dailyCharBudget > 0 && result.charsUsed + charsUsedToday >= dailyCharBudget) break;
                const row = queue.shift();
                if (!row) break;
                const title = String(row.title || "").trim();
                const description = String(row.description || "").trim();
                const srcLang = detectSourceLang(title, description);
                if (!srcLang) {
                  detail.skipped++;
                  result.skipped++;
                  processedCount++;
                  console.log(`  [retry ${processedCount}/${totalInQueue}] SKIP 无源语言 id=${row.id}`);
                  continue;
                }
                if (srcLang === targetLang) {
                  await writeSkipMarker(dbPool, target, row.id, targetLang);
                  detail.skipped++;
                  result.skipped++;
                  processedCount++;
                  console.log(`  [retry ${processedCount}/${totalInQueue}] SKIP 同语言(${srcLang}) id=${row.id}`);
                  continue;
                }
                batchItems.push({ row, title, description, sourceLang: srcLang as ChainSourceLang });
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
                if (dailyCharBudget > 0 && result.charsUsed + charsUsedToday >= dailyCharBudget) break;

                // 标题去重：相同标题只翻译一次
                const titleToItems = new Map<string, typeof items>();
                for (const item of items) {
                  if (!titleToItems.has(item.title)) titleToItems.set(item.title, []);
                  titleToItems.get(item.title)!.push(item);
                }

                const uniqueTitles: string[] = [];
                const dedupEntries: { title: string; cached: { titleTr: string; provider: string } }[] = [];
                for (const [title] of titleToItems) {
                  const cached = dedupCache.get(title);
                  if (cached) {
                    dedupEntries.push({ title, cached });
                  } else {
                    uniqueTitles.push(title);
                  }
                }

                // 批量翻译未命中的唯一标题
                const translatedMap = new Map<string, { titleTr: string; provider: string }>();
                if (uniqueTitles.length > 0) {
                  try {
                    const trResult = await translateViaChain(uniqueTitles, srcLang as ChainSourceLang, targetLang);
                    for (let i = 0; i < uniqueTitles.length; i++) {
                      const titleTr = String(trResult.translations[i] || "").trim();
                      translatedMap.set(uniqueTitles[i], { titleTr, provider: trResult.provider });
                      dedupCache.set(uniqueTitles[i], { titleTr, provider: trResult.provider });
                      result.charsUsed += uniqueTitles[i].length;
                    }
                  } catch (batchErr: any) {
                    const errMsg = batchErr?.message || String(batchErr);
                    const degraded = (batchErr?.degradedFrom as string[] | undefined)?.join(" → ") || "-";

                    // ── 批量失败降级：逐条单独重试 ──
                    for (const [title, titleItems] of titleToItems) {
                      let recovered = false;
                      try {
                        const singleResult = await translateViaChain([title], srcLang as ChainSourceLang, targetLang);
                        const titleTr = String(singleResult.translations[0] || "").trim();
                        if (titleTr) {
                          translatedMap.set(title, { titleTr, provider: singleResult.provider });
                          dedupCache.set(title, { titleTr, provider: singleResult.provider });
                          result.charsUsed += title.length;
                          recovered = true;
                        }
                      } catch { /* 单条也失败，走下方 FAIL 日志 */ }

                      if (!recovered) {
                        for (const item of titleItems) {
                          detail.failed++;
                          result.failed++;
                          processedCount++;
                          console.log(`  [retry ${processedCount}/${totalInQueue}] FAIL error="${errMsg}" degraded="${degraded}" id=${item.row.id} src=${srcLang}→${targetLang}`);
                          logger.warn(`table=${target.table} id=${item.row.id} lang=${targetLang} FAIL | sourceLang=${srcLang} error="${errMsg}" degraded="${degraded}" title="${item.title.slice(0, 80)}"`);
                        }
                      }
                    }
                    continue;
                  }
                }

                // ── Phase 3: 写库（翻译结果 + 去重缓存命中）──
                const allResults = new Map<string, { titleTr: string; provider: string }>();
                for (const [title, r] of translatedMap) allResults.set(title, r);
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
                      if (target.table === "crm_bid_notices" && titleTr) {
                        void syncWideIds(dbPool, [item.row.id]).catch(() => {});
                      }
                      detail.ok++;
                      result.ok++;
                      processedCount++;
                      console.log(`  [retry ${processedCount}/${totalInQueue}] OK   ${provider} id=${item.row.id} src=${srcLang}→${targetLang}`);
                      logger.info(`table=${target.table} id=${item.row.id} lang=${targetLang} OK provider=${provider} src=${srcLang}`);
                      markTranslationSuccess(target.table, item.row.id, targetLang);
                    } catch (writeErr: any) {
                      detail.failed++;
                      result.failed++;
                      processedCount++;
                      logger.warn(`table=${target.table} id=${item.row.id} WRITE_FAIL error="${writeErr?.message || writeErr}"`);
                    }
                  }
                }
              }

              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          })
        );

        result.details.push(detail);
      }
    }
  } finally {
    result.durationMs = Date.now() - startedAt;
    isRunning = false;
    lastResult = result;

    // ── 更新日预算状态（与 autoTranslate 共享预算池）──
    if (dailyCharBudget > 0 && result.charsUsed > 0) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        await dbPool.query(
          `INSERT INTO crm_translation_state (state_key, state_value)
           VALUES (?, ?), (?, ?)
           ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)`,
          ["budget_day", today, "budget_chars_used", String(charsUsedToday + result.charsUsed)]
        );
      } catch (err: any) {
        console.warn(`[retry-translate] 预算状态更新失败: ${err?.message || err}`);
      }
    }

    console.log(
      `[retry-translate] ── 批量重试完成 ── 扫描 ${result.scanned} 成功 ${result.ok} 失败 ${result.failed} 跳过 ${result.skipped} 字符 ${result.charsUsed} 耗时 ${Math.round(result.durationMs / 1000)}s`
    );
    logger.info(
      `DONE scanned=${result.scanned} ok=${result.ok} failed=${result.failed} skipped=${result.skipped} chars=${result.charsUsed} duration=${Math.round(result.durationMs / 1000)}s`
    );

    // 异步刷盘：将本轮成功翻译的失败日志行从文件中移除（非阻塞）
    void flushCleanedLogs().catch((err) => {
      console.warn(`[retry-translate] 日志清理失败（静默忽略）: ${err?.message || err}`);
    });
  }

  return result;
}

/**
 * 统计当前待重试的记录数量（不执行翻译，仅诊断用）
 */
export async function countPendingRetries(
  dbPool: Pool,
  includeExpired = true,
): Promise<{ targets: { table: string; lang: string; count: number }[]; total: number }> {
  const targets: { table: string; lang: string; count: number }[] = [];
  let total = 0;

  for (const target of SCAN_TARGETS) {
    for (const targetLang of ["zh", "en"] as const) {
      const expiredCondition = includeExpired
        ? "1=1"
        : ACTIVE_NOTICE_WHERE;

      const [rows] = await dbPool.query(
        `SELECT COUNT(*) AS cnt
         FROM ${target.table} n
         LEFT JOIN ${target.trTable} t ON t.${target.idCol} = n.id AND t.lang = ?
         WHERE ${expiredCondition}
           AND (
             t.id IS NULL
             OR (
               (t.title_tr IS NULL OR t.title_tr = '')
               AND (t.model IS NULL OR t.model NOT IN ('skip-same-lang'))
             )
           )
           AND n.title IS NOT NULL AND TRIM(n.title) <> ''`,
        [targetLang]
      );
      const count = Number((rows as RowDataPacket[])[0]?.cnt || 0);
      targets.push({ table: target.table, lang: targetLang, count });
      total += count;
    }
  }

  return { targets, total };
}

// ── 内部工具函数 ──

async function writeSkipMarker(
  dbPool: Pool,
  target: (typeof SCAN_TARGETS)[number],
  rowId: number,
  lang: string,
) {
  await dbPool.query(
    `INSERT INTO ${target.trTable} (${target.idCol}, lang, title_tr, description_tr, model)
     VALUES (?, ?, NULL, NULL, 'skip-same-lang')
     ON DUPLICATE KEY UPDATE model = VALUES(model)`,
    [rowId, lang]
  );
}
