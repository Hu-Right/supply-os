/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { pendingNoticeTranslations, translateNoticeViaChain, detectSourceLang } from "./services/notice-translation";
import { createDbPool } from "./db/pool";
import { ensureProcurementSchema } from "./db/schema";
import { backfillUserIds, hydratePaymentEnvFromDb } from "./db/backfills";
import { createLeadsStore } from "./services/leads";
import { PaymentService } from "./payment/PaymentService";
import { UsersRepo } from "./repos/users.repo";
import { MembershipRepo } from "./repos/membership.repo";
import { PaymentsRepo } from "./repos/payments.repo";
import { createApp } from "./app";
import type { AppContext } from "./context";

// ── 公采搜索功能（本地差异 #6：G.2 四参数搜索 + G.4 搜索落库 + F.1/F.3 防御）──
// F.1：user_key 落库前统一归一化（trim + 小写），与读侧 /api/notices/recommended 口径一致；
// 游客/空值返回 null（拒写 "guest" 占位，避免污染行为统计）

// In-memory persistent database for the live session
const leadsDb = createLeadsStore();

export async function startServer() {
  const PORT = 3039;

  // MySQL2 connection pool for crm database
  const dbPool = createDbPool();

  await ensureProcurementSchema(dbPool);
  await backfillUserIds(dbPool);
  await hydratePaymentEnvFromDb(dbPool);
  // UNSPSC bridge 同步已停用：crm_bid_notices.unspsc_codes 字段数据不准，
  // 由 CRM 侧 AI 分类后直接写入 crm_bid_notice_unspsc_codes，supply-os 不介入。

  // 初始化 PaymentService：配置表或环境变量启用 live 时走真实支付网关，否则使用 mock 闭环。
  const paymentMode = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const paymentService = PaymentService.initDefault(paymentMode);

  // Repository 层初始化
  const usersRepo = new UsersRepo(dbPool);
  const membershipRepo = new MembershipRepo(dbPool);
  const paymentsRepo = new PaymentsRepo(dbPool);

  const ctx: AppContext = { dbPool, paymentService, paymentMode, leadsDb, usersRepo, membershipRepo, paymentsRepo };
  const app = createApp(ctx);

  // Vite Integration for high performance SPA support
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── 增量双语翻译定时任务（本地差异 #19：多语言搜索与翻译机制完善）──
  // 公告由 CRM 侧爬虫写入 crm_bid_notices，本项目无插入钩子可挂，故用准实时轮询补齐：
  // 每轮扫描「未过期 + 水位以上 + 缺译文行」的最新公告，标题+描述分别翻译，
  // 目标语言由源语言动态决定（zh→en / en→zh / 小语种→zh+en），
  // 复用 translateNoticeViaChain（有道→DeepSeek→Gemini 三层降级 + 术语占位符保护）。
  const AUTO_TR_ENABLED = String(process.env.NOTICE_AUTO_TRANSLATE ?? "on").toLowerCase() !== "off";
  const AUTO_TR_INTERVAL_MS = Number(process.env.NOTICE_AUTO_TRANSLATE_INTERVAL_MS || 10 * 60 * 1000);
  const AUTO_TR_MAX_PER_RUN = Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 300);
  const AUTO_TR_DESC_MAX_CHARS = Number(process.env.NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS || 8000);
  const AUTO_TR_DAILY_CHAR_BUDGET = Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000);
  const AUTO_TR_CONCURRENCY = 3; // 有道 QPS=10，留余量给前台按需翻译
  const AUTO_TR_DELAY_MS = 200;
  let autoTrRunning = false; // 上一轮未结束则跳过本轮，避免任务叠加压垮翻译配额

  async function runIncrementalTranslation() {
    if (autoTrRunning) return;
    autoTrRunning = true;
    const startedAt = Date.now();
    let ok = 0;
    let failed = 0;
    let charsUsed = 0;
    try {
      // ── 预算检查：同日已耗尽则跳过本轮 ──
      const today = new Date().toISOString().slice(0, 10);
      const [stateRows] = await dbPool.query(
        "SELECT state_key, state_value FROM crm_translation_state WHERE state_key IN (?, ?, ?)",
        ["notice_id_cutoff", "budget_day", "budget_chars_used"]
      );
      const stateMap = new Map<string, string>();
      for (const row of stateRows as any[]) stateMap.set(row.state_key, String(row.state_value || ""));
      const cutoffId = Number(stateMap.get("notice_id_cutoff") || "0");
      const budgetDay = stateMap.get("budget_day") || "";
      if (budgetDay === today) {
        const used = Number(stateMap.get("budget_chars_used") || "0");
        if (used >= AUTO_TR_DAILY_CHAR_BUDGET) {
          console.warn(`[auto-translate] 日预算已耗尽 (${used}/${AUTO_TR_DAILY_CHAR_BUDGET})，本轮跳过`);
          autoTrRunning = false;
          return;
        }
        charsUsed = used;
      }

      // deadline_ts 秒/毫秒混存，折算成秒再与当前时间比较（与列表/统计端点同口径）
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";

      // 分两趟扫描：缺 zh 的、缺 en 的；每条取出后由源语言判定该方向是否真需翻译
      for (const targetLang of ["zh", "en"] as const) {
        if (charsUsed >= AUTO_TR_DAILY_CHAR_BUDGET) break;
        const [rows] = await dbPool.query(
          `SELECT n.id, n.title, n.description
             FROM crm_bid_notices n
             LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = ?
            WHERE n.id > ?
              AND (n.is_expired = 0 OR n.is_expired IS NULL)
              AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
              AND t.id IS NULL
              AND n.title IS NOT NULL AND TRIM(n.title) <> ''
            ORDER BY n.id DESC
            LIMIT ?`,
          [targetLang, cutoffId, AUTO_TR_MAX_PER_RUN]
        );
        // 详情端点正在整条翻译的公告本轮跳过，避免同一条重复过链
        const queue = (rows as any[]).filter(
          (row) => !pendingNoticeTranslations.has(`${row.id}:${targetLang}`)
        );
        if (queue.length === 0) continue;

        await Promise.all(
          Array.from({ length: AUTO_TR_CONCURRENCY }, async () => {
            while (queue.length) {
              if (charsUsed >= AUTO_TR_DAILY_CHAR_BUDGET) break;
              const row = queue.shift();
              if (!row) break;
              const title = String(row.title || "").trim();
              const description = String(row.description || "").trim();
              try {
                // 源语言检测：null（纯数字/符号）→ 跳过
                const sourceLang = detectSourceLang(title, description);
                if (!sourceLang) continue;
                // 源语言 === 目标语言 → 直通，不落库
                if (sourceLang === targetLang) continue;
                // 预算不足 → 退出本轮
                if (charsUsed >= AUTO_TR_DAILY_CHAR_BUDGET) break;

                // 标题翻译（各自独立调用翻译链）
                const titleResult = await translateNoticeViaChain(title, "", targetLang);
                const titleTr = String(titleResult.translations[0] || "").trim();

                // 描述翻译：非空且 ≤ 字符上限才过链，否则跳过（留给详情端点按需）
                let descTr: string | null = null;
                let descProvider: string | null = null;
                if (description && description.length <= AUTO_TR_DESC_MAX_CHARS) {
                  const descResult = await translateNoticeViaChain("", description, targetLang);
                  descTr = String(descResult.translations[1] || "").trim() || null;
                  descProvider = descResult.provider;
                }

                // 直通不落库（provider === "same-lang-passthrough"）
                if (titleResult.provider === "same-lang-passthrough") continue;

                // 累加字符预算（源语言字符）
                charsUsed += title.length + description.length;

                // 落库：COALESCE 保证描述跳过（NULL）时不擦掉详情端点按需补翻的结果
                await dbPool.query(
                  `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
                   VALUES (?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE
                     title_tr = VALUES(title_tr),
                     description_tr = COALESCE(VALUES(description_tr), description_tr),
                     model = VALUES(model)`,
                  [row.id, targetLang, titleTr || null, descTr, titleResult.provider]
                );
                ok += 1;
              } catch {
                // 全链失败/入库失败：不落库，下一轮自然重试
                failed += 1;
              }
              await new Promise((resolve) => setTimeout(resolve, AUTO_TR_DELAY_MS));
            }
          })
        );
      }

      // 回写预算状态
      await dbPool.query(
        `INSERT INTO crm_translation_state (state_key, state_value)
         VALUES (?, ?), (?, ?)
         ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)`,
        ["budget_day", today, "budget_chars_used", String(charsUsed)]
      );
      console.log(
        `[auto-translate] 增量双语翻译: 成功 ${ok} 失败 ${failed} 字符 ${charsUsed}/${AUTO_TR_DAILY_CHAR_BUDGET} 耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
    } catch (err: any) {
      console.warn("[auto-translate] 本轮扫描失败:", err?.message || err);
    } finally {
      autoTrRunning = false;
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully functional on http://0.0.0.0:${PORT}`);
    if (!AUTO_TR_ENABLED) {
      console.log("[auto-translate] 已禁用（NOTICE_AUTO_TRANSLATE=off）");
      return;
    }
    // 启动后 30s 跑首轮（避开启动期建表/预热），随后每 AUTO_TR_INTERVAL_MS 一轮
    setTimeout(() => void runIncrementalTranslation(), 30_000);
    setInterval(() => void runIncrementalTranslation(), AUTO_TR_INTERVAL_MS);
    console.log(
      `[auto-translate] 已启用: 每 ${Math.round(AUTO_TR_INTERVAL_MS / 60000)} 分钟扫描新增公告（水位以上），单轮上限 ${AUTO_TR_MAX_PER_RUN} 条/语言，双语（zh+en），日预算 ${AUTO_TR_DAILY_CHAR_BUDGET} 字符`
    );
  });
}
