/**
 * 增量双语翻译定时任务
 * Incremental bilingual translation scheduler
 *
 * @module server/services/autoTranslate
 * @description 公告由 CRM 侧爬虫写入 crm_bid_notices，本项目无插入钩子可挂，
 *   故用准实时轮询补齐：每轮对公告表与精选数据表（SCAN_TARGETS）分别扫描
 *   「未过期 + 水位以上 + 缺译文行」的最新数据，仅翻译标题（内容翻译暂关闭以控制成本），
 *   目标语言由源语言动态决定（zh→en / en→zh / 小语种→zh+en），
 *   复用 translateNoticeViaChain（DeepSeek→Gemini 两层降级 + 术语占位符保护）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ChainSourceLang } from "./translation/chain";
import { translateViaChain } from "./translation/chain";
import {
  pendingNoticeTranslations,
  translateNoticeViaChain,
  detectSourceLang,
} from "./notice-translation";
import { channelConfigured } from "../config/env";
import { createLogger } from "../utils/fileLogger";

const logger = createLogger("auto-translate");

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

const CONCURRENCY = 5;  // 5 并发 worker（降低并发避免 DeepSeek 429 限流）
const DELAY_MS = 200;   // 每条间隔 200ms（配合重试机制给 API 喘息时间）

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
  console.log(`[auto-translate] ── 开始扫描 ──`);

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
      console.log(`[auto-translate] 日预算已耗尽 (${used}/${cfg.dailyCharBudget})，本轮跳过`);
      return { ok: 0, failed: 0, charsUsed: used };
    }
    charsUsed = used;
  }

  const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";

  for (const target of SCAN_TARGETS) {
    const cutoffId = Number(stateMap.get(target.cutoffKey) || "0");
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
          AND (n.is_expired = 0 OR n.is_expired IS NULL)
          AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
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
        [targetLang, cutoffId, sqlLimit]
      );
      let queue = (rows as RowDataPacket[]).filter(
        (row) => !pendingNoticeTranslations.has(`${target.idCol}:${row.id}:${targetLang}`)
      );

      // ── 同语言预过滤（仅 en 扫描生效）──
      // 英文原文记录不需要翻译为英文，立即写 skip-same-lang 标记，
      // 避免它们反复占据 LIMIT 配额、挤掉真正需要翻译的小语种记录。
      if (targetLang === "en" && queue.length > 0) {
        const needTranslate: any[] = [];
        let skipCount = 0;
        for (const row of queue) {
          const title = String(row.title || "").trim();
          const description = String(row.description || "").trim();
          const hasCache = !!String(row.cached_title_tr || "").trim() || !!String(row.cached_desc_tr || "").trim();
          const srcLang = detectSourceLang(title, description);
          if (srcLang === "en") {
            if (!hasCache) await writeSkipMarker(target, row.id, targetLang);
            skipCount++;
          } else {
            needTranslate.push(row);
          }
        }
        if (skipCount > 0) {
          console.log(`[auto-translate] ${target.table} lang=en 预过滤 ${skipCount} 条英文原文（已写 skip 标记）`);
        }
        queue = needTranslate.slice(0, cfg.maxPerRun);
      }

      if (queue.length === 0) continue;
      const totalInQueue = queue.length;
      let processedCount = 0;
      console.log(`[auto-translate] 扫描 ${target.table} lang=${targetLang} 待处理 ${totalInQueue} 条`);

      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (queue.length) {
            if (charsUsed >= cfg.dailyCharBudget) break;
            const row = queue.shift();
            if (!row) break;
            const mySeq = ++processedCount; // 捕获当前序号到局部变量，避免并发竞态
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
                console.log(`  [${mySeq}/${totalInQueue}] SKIP 无源语言 id=${row.id}`);
                continue;
              }
              if (sourceLang === targetLang) {
                if (!hasExistingCache) await writeSkipMarker(target, row.id, targetLang);
                console.log(`  [${mySeq}/${totalInQueue}] SKIP 同语言(${sourceLang}) id=${row.id}`);
                continue;
              }
              if (charsUsed >= cfg.dailyCharBudget) break;

              const result = await translateNoticeViaChain(title, "", targetLang, sourceLang as ChainSourceLang);
              const titleTr = String(result.translations[0] || "").trim();

              if (result.provider === "same-lang-passthrough") {
                if (!hasExistingCache) await writeSkipMarker(target, row.id, targetLang);
                console.log(`  [${mySeq}/${totalInQueue}] SKIP 直通(${sourceLang}) id=${row.id}`);
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
              ok += 1;
              console.log(`  [${mySeq}/${totalInQueue}] OK   ${result.provider} id=${row.id} src=${sourceLang}→${targetLang}`);
            } catch (err: any) {
              failed += 1;
              const errMsg = err?.message || String(err);
              const degraded = (err?.degradedFrom as string[] | undefined)?.join(" → ") || "-";
              console.log(`  [${mySeq}/${totalInQueue}] FAIL error="${errMsg}" degraded="${degraded}" id=${row.id} src=${sourceLang ?? "unknown"}→${targetLang}`);
              logger.warn(
                `${logPrefix} FAIL | sourceLang=${sourceLang ?? "unknown"} error="${errMsg}" degraded="${degraded}" title="${titlePreview}" desc="${descPreview}"`
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
    const result = await translateViaChain(["Hello"], "en", "zh");
    console.log(`[auto-translate] ✓ DeepSeek 健康检查通过 (provider=${result.provider})`);
  } catch (err: any) {
    const degraded = (err?.degradedFrom as string[] | undefined)?.join(" → ") || err?.message || String(err);
    console.error(`[auto-translate] ✗ DeepSeek 健康检查失败: ${degraded}。翻译任务将继续尝试但可能持续失败，请检查 API Key 与网络。`);
  }
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
      logger.warn(`SCAN_FAIL error="${err?.message || err}"`);
    } finally {
      running = false;
    }
  };

  // 启动时先做健康检查，30s 后跑首轮
  void probeDeepSeekHealth();
  const timer1 = setTimeout(() => void tick(), 30_000);
  const timer2 = setInterval(() => void tick(), cfg.intervalMs);
  console.log(
    `[auto-translate] 已启用: 每 ${Math.round(cfg.intervalMs / 60000)} 分钟扫描新增公告（水位以上），单轮上限 ${cfg.maxPerRun} 条/语言，仅标题翻译（内容暂关闭），双语（zh+en），日预算 ${cfg.dailyCharBudget} 字符，并发 ${CONCURRENCY}`
  );

  return () => {
    clearTimeout(timer1);
    clearInterval(timer2);
  };
}
