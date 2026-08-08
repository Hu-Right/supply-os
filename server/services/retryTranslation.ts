/**
 * 批量翻译重试服务
 * Batch translation retry for previously failed notices
 *
 * @module server/services/retryTranslation
 * @description 扫描翻译表中缺失/空译文的记录（含已过期公告），重新走翻译链。
 *   与 autoTranslate.ts 的区别：
 *   - autoTranslate 仅扫描 id > cutoffId 且未过期的新增记录；
 *   - 本服务专门针对历史失败记录（id < cutoffId 或已过期），不受水位线限制。
 *   通过 admin API 手动触发，避免与定时任务争抢 API 配额。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ChainSourceLang } from "./translation/chain";
import {
  pendingNoticeTranslations,
  translateNoticeViaChain,
  detectSourceLang,
} from "./notice-translation";
import { createLogger } from "../utils/fileLogger";

const logger = createLogger("retry-translate");

// ── 扫描目标：与 autoTranslate.ts 保持一致 ──
const SCAN_TARGETS = [
  { table: "crm_bid_notices", trTable: "crm_notice_translations", idCol: "notice_id", cutoffKey: "notice_id_cutoff" },
  { table: "crm_bid_opportunities", trTable: "crm_opportunity_translations", idCol: "opportunity_id", cutoffKey: "opportunity_id_cutoff" },
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

  const result: RetryResult = {
    scanned: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
    charsUsed: 0,
    durationMs: 0,
    details: [],
  };

  console.log(`[retry-translate] ── 开始批量重试扫描 ── (includeExpired=${includeExpired}, maxPerScan=${maxPerScan}, concurrency=${concurrency})`);
  logger.info(`START includeExpired=${includeExpired} maxPerScan=${maxPerScan} concurrency=${concurrency}`);

  try {
    for (const target of SCAN_TARGETS) {
      for (const targetLang of ["zh", "en"] as const) {
        const detail = { table: target.table, lang: targetLang, scanned: 0, ok: 0, failed: 0, skipped: 0 };

        // ── 查询缺失译文的记录 ──
        // 条件：翻译行不存在 OR (title_tr 为空 AND model 非 skip-same-lang)
        // 与 autoTranslate 的区别：不加 cutoffId 限制，不加过期限制（可选）
        const expiredCondition = includeExpired
          ? "1=1" // 不过滤过期
          : "(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))";

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

        // ── 并发处理 ──
        await Promise.all(
          Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (queue.length) {
              const row = queue.shift();
              if (!row) break;
              const mySeq = ++processedCount;
              const title = String(row.title || "").trim();
              const description = String(row.description || "").trim();
              const logPrefix = `table=${target.table} id=${row.id} lang=${targetLang}`;
              let sourceLang: string | null = null;

              try {
                sourceLang = detectSourceLang(title, description);
                if (!sourceLang) {
                  detail.skipped++;
                  result.skipped++;
                  console.log(`  [retry ${mySeq}/${totalInQueue}] SKIP 无源语言 id=${row.id}`);
                  continue;
                }
                if (sourceLang === targetLang) {
                  // 同语言：写 skip 标记，避免后续扫描重复命中
                  await writeSkipMarker(dbPool, target, row.id, targetLang);
                  detail.skipped++;
                  result.skipped++;
                  console.log(`  [retry ${mySeq}/${totalInQueue}] SKIP 同语言(${sourceLang}) id=${row.id}`);
                  continue;
                }

                const translationResult = await translateNoticeViaChain(title, "", targetLang, sourceLang as ChainSourceLang);
                const titleTr = String(translationResult.translations[0] || "").trim();

                if (translationResult.provider === "same-lang-passthrough") {
                  await writeSkipMarker(dbPool, target, row.id, targetLang);
                  detail.skipped++;
                  result.skipped++;
                  console.log(`  [retry ${mySeq}/${totalInQueue}] SKIP 直通(${sourceLang}) id=${row.id}`);
                  continue;
                }

                result.charsUsed += title.length;

                // 写入翻译结果（UPSERT：覆盖可能存在的空行）
                await dbPool.query(
                  `INSERT INTO ${target.trTable} (${target.idCol}, lang, title_tr, description_tr, model)
                   VALUES (?, ?, ?, NULL, ?)
                   ON DUPLICATE KEY UPDATE
                     title_tr = COALESCE(VALUES(title_tr), title_tr),
                     model = VALUES(model)`,
                  [row.id, targetLang, titleTr || null, translationResult.provider]
                );

                detail.ok++;
                result.ok++;
                const degraded = translationResult.degradedFrom?.join(" → ") || "-";
                console.log(`  [retry ${mySeq}/${totalInQueue}] OK   ${translationResult.provider} id=${row.id} src=${sourceLang}→${targetLang} degraded=${degraded}`);
                logger.info(`${logPrefix} OK provider=${translationResult.provider} src=${sourceLang} degraded=${degraded}`);
              } catch (err: any) {
                detail.failed++;
                result.failed++;
                const errMsg = err?.message || String(err);
                const degraded = (err?.degradedFrom as string[] | undefined)?.join(" → ") || "-";
                console.log(`  [retry ${mySeq}/${totalInQueue}] FAIL error="${errMsg}" degraded="${degraded}" id=${row.id} src=${sourceLang ?? "unknown"}→${targetLang}`);
                logger.warn(`${logPrefix} FAIL | sourceLang=${sourceLang ?? "unknown"} error="${errMsg}" degraded="${degraded}" title="${title.slice(0, 80)}"`);
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

    console.log(
      `[retry-translate] ── 批量重试完成 ── 扫描 ${result.scanned} 成功 ${result.ok} 失败 ${result.failed} 跳过 ${result.skipped} 字符 ${result.charsUsed} 耗时 ${Math.round(result.durationMs / 1000)}s`
    );
    logger.info(
      `DONE scanned=${result.scanned} ok=${result.ok} failed=${result.failed} skipped=${result.skipped} chars=${result.charsUsed} duration=${Math.round(result.durationMs / 1000)}s`
    );
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
        : "(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))";

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
