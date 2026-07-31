/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { pendingNoticeTranslations, translateNoticeViaChain } from "./services/notice-translation";
import { createDbPool } from "./db/pool";
import { ensureProcurementSchema } from "./db/schema";
import { backfillUserIds, hydratePaymentEnvFromDb } from "./db/backfills";
import { createLeadsStore } from "./services/leads";
import { PaymentService } from "./payment/PaymentService";
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

  const ctx: AppContext = { dbPool, paymentService, paymentMode, leadsDb };
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

  // ── 新增公告标题的增量翻译（服务内定时任务，10 分钟一轮）──
  // 公告由 CRM 侧爬虫写入 crm_bid_notices，本项目无插入钩子可挂，故用准实时轮询补齐：
  // 每轮只扫「未过期 + 无 zh 译文行」的最新公告，仅翻标题（描述仍由详情端点按需补翻），
  // 复用 translateNoticeViaChain（有道→DeepSeek→Gemini 三层降级 + 术语占位符保护）。
  const AUTO_TR_LANG = "zh"; // 搜索只 JOIN lang='zh'，其余语言仍走按需翻译
  const AUTO_TR_ENABLED = String(process.env.NOTICE_AUTO_TRANSLATE ?? "on").toLowerCase() !== "off";
  const AUTO_TR_INTERVAL_MS = Number(process.env.NOTICE_AUTO_TRANSLATE_INTERVAL_MS || 10 * 60 * 1000);
  const AUTO_TR_MAX_PER_RUN = Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 300);
  const AUTO_TR_CONCURRENCY = 3; // 有道 QPS=10，留余量给前台按需翻译
  const AUTO_TR_DELAY_MS = 200;
  let autoTrRunning = false; // 上一轮未结束则跳过本轮，避免任务叠加压垮翻译配额

  async function runIncrementalTitleTranslation() {
    if (autoTrRunning) return;
    autoTrRunning = true;
    const startedAt = Date.now();
    let ok = 0;
    let failed = 0;
    try {
      // deadline_ts 秒/毫秒混存，折算成秒再与当前时间比较（与列表/统计端点同口径）
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      const [rows] = await dbPool.query(
        `SELECT n.id, n.title
           FROM crm_bid_notices n
           LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = ?
          WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
            AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
            AND t.id IS NULL
            AND n.title IS NOT NULL AND TRIM(n.title) <> ''
          ORDER BY n.id DESC
          LIMIT ?`,
        [AUTO_TR_LANG, AUTO_TR_MAX_PER_RUN]
      );
      // 详情端点正在整条翻译的公告本轮跳过，避免同一条重复过链
      const queue = (rows as any[]).filter(
        (row) => !pendingNoticeTranslations.has(`${row.id}:${AUTO_TR_LANG}`)
      );
      if (queue.length === 0) return;
      await Promise.all(
        Array.from({ length: AUTO_TR_CONCURRENCY }, async () => {
          while (queue.length) {
            const row = queue.shift();
            if (!row) break;
            try {
              // 描述传空串：translateViaChain 过滤空段，不产生额外 API 调用
              const { translations, provider } = await translateNoticeViaChain(
                String(row.title),
                "",
                AUTO_TR_LANG
              );
              const titleTr = String(translations[0] || "").trim();
              if (!titleTr) {
                failed += 1;
              } else {
                // 只写 title_tr：description_tr 留 NULL 由详情端点按需补翻，
                // 且冲突时不覆盖已有整条译文的描述
                await dbPool.query(
                  `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
                   VALUES (?, ?, ?, NULL, ?)
                   ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), model = VALUES(model)`,
                  [row.id, AUTO_TR_LANG, titleTr, provider]
                );
                ok += 1;
              }
            } catch {
              // 全链失败/入库失败：不落库，下一轮自然重试
              failed += 1;
            }
            await new Promise((resolve) => setTimeout(resolve, AUTO_TR_DELAY_MS));
          }
        })
      );
      console.log(
        `[auto-translate] 标题增量翻译: 成功 ${ok} 失败 ${failed} 耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`
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
    setTimeout(() => void runIncrementalTitleTranslation(), 30_000);
    setInterval(() => void runIncrementalTitleTranslation(), AUTO_TR_INTERVAL_MS);
    console.log(
      `[auto-translate] 已启用: 每 ${Math.round(AUTO_TR_INTERVAL_MS / 60000)} 分钟扫描新增公告，单轮上限 ${AUTO_TR_MAX_PER_RUN} 条（仅标题→${AUTO_TR_LANG}）`
    );
  });
}
