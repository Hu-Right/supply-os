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
 *   复用 translateNoticeViaChain（DeepSeek→Gemini 两层降级 + 术语占位符保护）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ChainSourceLang } from "./chain";
import { translateViaChain } from "./chain";
import {
  pendingNoticeTranslations,
  translateNoticeViaChain,
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
    maxPerRun: Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 300),
    descMaxChars: Number(process.env.NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS || 8000),
    dailyCharBudget: Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000),
  };
}

const CONCURRENCY = 20;  // 20 并发 worker（降低并发避免 DeepSeek 429 限流）
const DELAY_MS = 200;   // 每条间隔 200ms（配合重试机制给 API 喘息时间）

// 扫描目标白名单：公告表 + 精选数据表（两表 is_expired/deadline_ts 列名一致）；
// 表名/列名均来自常量，无注入面
const SCAN_TARGETS = [
  { table: "crm_bid_notices", trTable: "crm_notice_translations", idCol: "notice_id", cutoffKey: "notice_id_cutoff" },
  { table: "crm_bid_opportunities", trTable: "crm_opportunity_translations", idCol: "opportunity_id", cutoffKey: "opportunity_id_cutoff" },
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

/** 格式化北京时间用于日志输出 */
function formatBJTime(d: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(d);
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
    "SELECT state_key, state_value FROM crm_translation_state WHERE state_key IN (?, ?, ?, ?)",
    ["notice_id_cutoff", "opportunity_id_cutoff", "budget_day", "budget_chars_used"]
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

  for (const target of SCAN_TARGETS) {
    const cutoffId = Number(stateMap.get(target.cutoffKey) || "0");
    let maxIdProcessed = 0; // 水位线追踪：本轮处理的最大 ID
    for (const targetLang of ["zh", "en"] as const) {
      if (charsUsed >= cfg.dailyCharBudget) break;
      // en 扫描时多取：英文原文会被预过滤（写 skip 标记），需要更大的采样
      // 才能找到足够多的小语种记录来翻译
      const sqlLimit = targetLang === "en" ? cfg.maxPerRun * 5 : cfg.maxPerRun;
      const [rows] = await dbPool.query(
        `SELECT n.id, n.title, n.description, n.reference,
                t.title_tr AS cached_title_tr,
                t.description_tr AS cached_desc_tr,
                t.model AS cached_model
         FROM ${target.table} n
         LEFT JOIN ${target.trTable} t ON t.${target.idCol} = n.id AND t.lang = ?
        WHERE n.id > ?
          AND ${activeCondition}
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
        [targetLang, cutoffId, sqlLimit]
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
            const row = queue.shift();
            if (!row) break;
            const title = String(row.title || "").trim();
            const description = String(row.description || "").trim();
            const reference = String(row.reference || "").trim();
            const cachedTitleTr = String(row.cached_title_tr || "").trim();
            const cachedDescTr = String(row.cached_desc_tr || "").trim();
            const hasExistingCache = !!cachedTitleTr || !!cachedDescTr;
            const titlePreview = title.length > 80 ? title.slice(0, 80) + "..." : title;
            const descPreview = description.length > 80 ? description.slice(0, 80) + "..." : description;
            const logPrefix = `table=${target.table} id=${row.id}${reference ? ` ref=${reference}` : ""} lang=${targetLang}`;
            let sourceLang: string | null = null;
            try {
              sourceLang = detectSourceLang(title, description);
              if (!sourceLang) {
                if (!hasExistingCache) await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              if (sourceLang === targetLang) {
                if (!hasExistingCache) await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              if (charsUsed >= cfg.dailyCharBudget) break;

              const result = await translateNoticeViaChain(title, "", targetLang, sourceLang as ChainSourceLang);
              const titleTr = String(result.translations[0] || "").trim();

              if (result.provider === "same-lang-passthrough") {
                if (!hasExistingCache) await writeSkipMarker(target, row.id, targetLang);
                continue;
              }
              charsUsed += title.length;

              await dbPool.query(
                `INSERT INTO ${target.trTable} (${target.idCol}, lang, title_tr, description_tr, model)
                 VALUES (?, ?, ?, NULL, ?)
                 ON DUPLICATE KEY UPDATE
                   title_tr = COALESCE(VALUES(title_tr), title_tr),
                   model = VALUES(model)`,
                [row.id, targetLang, titleTr || null, result.provider]
              );
              
              // 通过统一路径同步宽表（宽表写入单一路径：syncWideIds）
              if (target.table === "crm_bid_notices" && titleTr) {
                void syncWideIds(dbPool, [row.id]).catch(() => {});
              }
              
              ok += 1;
              // 标记日志清理：若该记录之前有失败日志，成功翻译后自动移除
              markTranslationSuccess(target.table, row.id, targetLang);
            } catch (err: any) {
              failed += 1;
              const errMsg = err?.message || String(err);
              const degraded = (err?.degradedFrom as string[] | undefined)?.join(" → ") || "-";
              logger.warn(
                `${logPrefix} FAIL | sourceLang=${sourceLang ?? "unknown"} error="${errMsg}" degraded="${degraded}" title="${titlePreview}" desc="${descPreview}"`
              );
            } finally {
              // 无论成功/失败/跳过，均推进水位线（避免下次重复扫描已处理记录）
              if (row.id > maxIdProcessed) maxIdProcessed = row.id;
            }
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          }
        })
      );
    }

    // ── 水位线更新：本轮处理过的记录推进 cutoff ──
    // 仅当实际处理了行时才更新，避免空轮次将 cutoff 错误推进
    if (maxIdProcessed > 0) {
      await dbPool.query(
        `INSERT INTO crm_translation_state (state_key, state_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)`,
        [target.cutoffKey, String(maxIdProcessed)]
      );
      logger.info(`${target.table} 水位线更新 → ${maxIdProcessed}`);
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
      const result = await runIncrementalTranslation(dbPool, cfg);
      logger.info(`翻译完成 ok=${result.ok} failed=${result.failed} charsUsed=${result.charsUsed}`);
    } catch (err: any) {
      logger.warn(`SCAN_FAIL error="${err?.message || err}"`);
    } finally {
      running = false;
      scheduleNext();
    }
  };

  /** 递归调度：计算下一个触发时刻并设置单次 setTimeout。
   *  容错：若距离触发时刻不足 1 分钟（服务启动耗时跨过触发点），
   *  立即执行翻译而非跳过，避免整轮调度被吞。 */
  function scheduleNext() {
    const next = nextBeijingTrigger();
    const delayMs = Math.max(0, next.getTime() - Date.now());
    if (delayMs < 60_000) {
      // 触发时刻已过或即将到来 → 立即执行，不冒 setTimeout 跨过的风险
      logger.info(`触发时刻已过，立即执行翻译`);
      nextTimer = setTimeout(() => void tick(), 0);
    } else {
      logger.info(`下次翻译调度: ${formatBJTime(next)} (${Math.round(delayMs / 3600000)}h 后)`);
      nextTimer = setTimeout(() => void tick(), delayMs);
    }
  }

  // 启动时先做健康检查，再调度首次运行
  void probeDeepSeekHealth();
  console.log("[auto-translate] 定时翻译已启用: 每日北京时间 06:00 / 13:00");
  scheduleNext();

  return () => {
    if (nextTimer) clearTimeout(nextTimer);
  };
}
